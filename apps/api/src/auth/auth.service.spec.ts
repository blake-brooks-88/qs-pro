import { Test, TestingModule } from '@nestjs/testing';
/* eslint-disable @typescript-eslint/unbound-method */
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi,
} from 'vitest';
import {
  ITenantRepository,
  IUserRepository,
  ICredentialsRepository,
} from '@qs-pro/database';
import { RlsContextService } from '../database/rls-context.service';

const server = setupServer(
  http.post(
    'https://test-tssd.auth.marketingcloudapis.com/v2/token',
    async ({ request }) => {
      const bodyText = await request.text();
      const params = new URLSearchParams(bodyText);
      const body = Object.fromEntries(params.entries());

      if (
        body.grant_type === 'authorization_code' &&
        body.code === 'valid-code'
      ) {
        return HttpResponse.json({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
          rest_instance_url: 'https://test-rest.com',
          soap_instance_url: 'https://test-soap.com',
          scope: 'read write',
          token_type: 'Bearer',
        });
      }

      return new HttpResponse(null, { status: 401 });
    },
  ),
  http.get('https://test-tssd.auth.marketingcloudapis.com/v2/userinfo', () =>
    HttpResponse.json({
      user: {
        sub: 'sf-sub',
        name: 'SF User',
        email: 'sf-user@example.com',
        member_id: 'mid-123',
      },
      organization: {
        enterprise_id: 12345,
      },
    }),
  ),
);

describe('AuthService', () => {
  let service: AuthService;
  let tenantRepo: ITenantRepository;
  let userRepo: IUserRepository;
  let credRepo: ICredentialsRepository;
  let module: TestingModule;

  beforeAll(async () => {
    server.listen();
    module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'MCE_CLIENT_ID') return 'client-id';
              if (key === 'MCE_CLIENT_SECRET') return 'client-secret';
              if (key === 'MCE_REDIRECT_URI')
                return 'http://localhost/callback';
              if (key === 'ENCRYPTION_KEY')
                return '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
              return null;
            }),
          },
        },
        {
          provide: 'TENANT_REPOSITORY',
          useValue: {
            upsert: vi.fn().mockResolvedValue({
              id: 't-1',
              eid: '12345',
              tssd: 'test-tssd',
            }),
            findById: vi.fn().mockResolvedValue({
              id: 't-1',
              eid: '12345',
              tssd: 'test-tssd',
            }),
          },
        },
        {
          provide: 'USER_REPOSITORY',
          useValue: {
            upsert: vi.fn().mockResolvedValue({
              id: 'u-1',
              sfUserId: 'sf-1',
              tenantId: 't-1',
            }),
            findBySfUserId: vi.fn().mockResolvedValue({
              id: 'u-1',
              sfUserId: 'sf-1',
              tenantId: 't-1',
            }),
          },
        },
        {
          provide: 'CREDENTIALS_REPOSITORY',
          useValue: {
            upsert: vi.fn().mockResolvedValue({}),
            findByUserTenantMid: vi.fn().mockResolvedValue({
              userId: 'u-1',
              tenantId: 't-1',
              mid: 'mid-1',
              refreshToken: 'Q7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u=',
            }),
          },
        },
        {
          provide: RlsContextService,
          useValue: {
            runWithTenantContext: vi.fn(
              async (
                _tenantId: string,
                _mid: string,
                fn: () => Promise<unknown>,
              ) => fn(),
            ),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    tenantRepo = module.get('TENANT_REPOSITORY');
    userRepo = module.get('USER_REPOSITORY');
    credRepo = module.get('CREDENTIALS_REPOSITORY');
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => server.resetHandlers());
  afterAll(async () => {
    server.close();
    await module.close();
  });

  it('should exchange code for token', async () => {
    const result = await service.exchangeCodeForToken(
      'test-tssd',
      'valid-code',
    );
    expect(result.access_token).toBe('new-access-token');
  });

  it('should handle callback and save tokens', async () => {
    const result = await service.handleCallback(
      'test-tssd',
      'valid-code',
      'sf-1',
      '12345',
      undefined,
      undefined,
      'mid-1',
    );
    expect(result.user.sfUserId).toBe('sf-1');
    expect(vi.mocked(tenantRepo.upsert)).toHaveBeenCalled();
    expect(vi.mocked(userRepo.upsert)).toHaveBeenCalled();
    expect(vi.mocked(credRepo.upsert)).toHaveBeenCalled();
  });

  it('should derive user identifiers from userinfo', async () => {
    await service.handleCallback('test-tssd', 'valid-code');

    expect(vi.mocked(tenantRepo.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({ eid: '12345', tssd: 'test-tssd' }),
    );
    expect(vi.mocked(userRepo.upsert)).toHaveBeenCalledWith(
      expect.objectContaining({
        sfUserId: 'sf-sub',
        tenantId: 't-1',
        email: 'sf-user@example.com',
        name: 'SF User',
      }),
    );
  });
});
