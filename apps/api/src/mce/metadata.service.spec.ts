/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { MetadataService } from './metadata.service';
import { MceBridgeService } from './mce-bridge.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('MetadataService', () => {
  let service: MetadataService;
  let bridge: MceBridgeService;

  const mockBridge = {
    soapRequest: vi.fn(),
  };

  const mockCache = {
    get: vi.fn(),
    set: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetadataService,
        {
          provide: MceBridgeService,
          useValue: mockBridge,
        },
        {
          provide: CACHE_MANAGER,
          useValue: mockCache,
        },
      ],
    }).compile();

    service = module.get<MetadataService>(MetadataService);
    bridge = module.get<MceBridgeService>(MceBridgeService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getFolders', () => {
    it('should return folders from cache if available', async () => {
      mockCache.get.mockResolvedValue([{ id: '1', Name: 'Test' }]);

      const result = await service.getFolders('t1', 'u1', 'mid1', 'eid1');

      expect(result).toEqual([{ id: '1', Name: 'Test' }]);
      expect(mockCache.get).toHaveBeenCalledWith('folders:t1:mid1:eid1');
      expect(bridge.soapRequest).not.toHaveBeenCalled();
    });

    it('should fetch from MCE if cache miss and set cache', async () => {
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: [{ ID: '1', Name: 'Folder1' }],
            },
          },
        })
        .mockResolvedValueOnce({
          Body: {
            RetrieveResponseMsg: {
              Results: [{ ID: '2', Name: 'SharedFolder' }],
            },
          },
        });

      const result = await service.getFolders('t1', 'u1', 'mid1', 'eid1');

      expect(result).toEqual([
        { ID: '1', Name: 'Folder1' },
        { ID: '2', Name: 'SharedFolder' },
      ]);
      expect(bridge.soapRequest).toHaveBeenCalledTimes(2);
      expect(mockCache.set).toHaveBeenCalledWith(
        'folders:t1:mid1:eid1',
        expect.any(Array),
        600000,
      ); // 10 mins
    });

    it('should paginate if MoreDataAvailable is returned', async () => {
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest.mockImplementation(async (_tid, _uid, _mid, body) => {
        if (body.includes('<ClientID>eid1</ClientID>')) {
          // Shared Call
          return {
            Body: {
              RetrieveResponseMsg: {
                OverallStatus: 'OK',
                Results: [{ ID: '3', Name: 'Folder3' }],
              },
            },
          };
        }
        if (body.includes('<ContinueRequest>req-123</ContinueRequest>')) {
          // Local Call - Page 2
          return {
            Body: {
              RetrieveResponseMsg: {
                OverallStatus: 'OK',
                Results: [{ ID: '2', Name: 'Folder2' }],
              },
            },
          };
        }
        // Local Call - Page 1
        return {
          Body: {
            RetrieveResponseMsg: {
              OverallStatus: 'MoreDataAvailable',
              RequestID: 'req-123',
              Results: [{ ID: '1', Name: 'Folder1' }],
            },
          },
        };
      });

      const result = await service.getFolders('t1', 'u1', 'mid1', 'eid1');

      expect(result).toHaveLength(3);
      // 1 Local Page 1, 1 Local Page 2, 1 Shared Page 1
      expect(mockBridge.soapRequest).toHaveBeenCalledTimes(3);

      // Verify at least one call used ContinueRequest
      const callBodies = mockBridge.soapRequest.mock.calls.map((c) => c[3]);
      expect(callBodies.some((b) => b.includes('<ContinueRequest>req-123</ContinueRequest>'))).toBe(
        true,
      );
    });
  });

  describe('getDataExtensions', () => {
    it('should fetch local and shared DEs and merge them', async () => {
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest
        .mockResolvedValueOnce({
          // Local
          Body: {
            RetrieveResponseMsg: {
              Results: [{ CustomerKey: 'DE1', Name: 'LocalDE' }],
            },
          },
        })
        .mockResolvedValueOnce({
          // Shared
          Body: {
            RetrieveResponseMsg: {
              Results: [{ CustomerKey: 'DE2', Name: 'SharedDE' }],
            },
          },
        });

      const result = await service.getDataExtensions(
        't1',
        'u1',
        'mid1',
        'eid123',
      );

      expect(result).toHaveLength(2);
      expect(result.find((r) => r.CustomerKey === 'DE1')).toBeDefined();
      expect(result.find((r) => r.CustomerKey === 'DE2')).toBeDefined();

      // Verify calls
      expect(bridge.soapRequest).toHaveBeenCalledTimes(2);
      // Check for Shared call specific logic (ClientIDs) if implemented
    });
  });

  describe('getFields', () => {
    it('should cache fields by DE key', async () => {
      const deKey = 'MY_DE_KEY';
      mockCache.get.mockResolvedValue(null);
      mockBridge.soapRequest.mockResolvedValue({
        Body: { RetrieveResponseMsg: { Results: [{ Name: 'Field1' }] } },
      });

      await service.getFields('t1', 'u1', 'mid1', deKey);

      expect(mockCache.set).toHaveBeenCalledWith(
        `fields:t1:mid1:${deKey}`,
        expect.any(Array),
        1800000,
      ); // 30 mins
    });
  });
});
