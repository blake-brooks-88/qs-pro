import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AppError,
  AuthService,
  EncryptionService,
  ErrorCode,
  ErrorMessages,
  RlsContextService,
  SeatLimitService,
} from '@qpp/backend-shared';
import type {
  Credential,
  ICredentialsRepository,
  ITenantRepository,
  IUserRepository,
  Tenant,
} from '@qpp/database';
import { encrypt } from '@qpp/database';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

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
              if (key === 'MCE_CLIENT_ID') {
                return 'client-id';
              }
              if (key === 'MCE_CLIENT_SECRET') {
                return 'client-secret';
              }
              if (key === 'MCE_REDIRECT_URI') {
                return 'http://localhost/callback';
              }
              if (key === 'ENCRYPTION_KEY') {
                return '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
              }
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
            upsert: vi.fn().mockImplementation((values) => ({
              id: 'u-1',
              ...(values as Record<string, unknown>),
            })),
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
        {
          provide: SeatLimitService,
          useValue: {
            checkSeatLimit: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: EncryptionService,
          useValue: {
            encrypt: vi.fn((v: string) =>
              encrypt(
                v,
                '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
              ),
            ),
            decrypt: vi.fn((v: string) => `decrypted:${v}`),
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
      'sf-sub',
      '12345',
      undefined,
      undefined,
      'mid-123',
    );
    expect(result.user.sfUserId).toBe('sf-sub');
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

  describe('refreshToken error handling', () => {
    it('throws MCE_CREDENTIALS_MISSING when no credentials found', async () => {
      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(undefined);

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1');
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(
          ErrorCode.MCE_CREDENTIALS_MISSING,
        );
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.MCE_CREDENTIALS_MISSING],
        );
        expect((error as AppError).context).toEqual({
          userId: 'u-1',
          tenantId: 't-1',
          mid: 'mid-1',
        });
      }
    });

    it('throws MCE_TENANT_NOT_FOUND when tenant does not exist', async () => {
      const credential: Partial<Credential> = {
        userId: 'u-1',
        tenantId: 't-1',
        mid: 'mid-1',
        refreshToken: 'Q7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u=',
      };
      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(
        credential as Credential,
      );
      vi.mocked(tenantRepo.findById).mockResolvedValueOnce(undefined);

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1');
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.MCE_TENANT_NOT_FOUND);
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.MCE_TENANT_NOT_FOUND],
        );
        expect((error as AppError).context).toEqual({ tenantId: 't-1' });
      }
    });

    it('throws CONFIG_ERROR when EncryptionService throws due to missing key', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);
      const credential: Partial<Credential> = {
        userId: 'u-1',
        tenantId: 't-1',
        mid: 'mid-1',
        accessToken: 'encrypted-token',
        refreshToken: 'encrypted-refresh',
        expiresAt: futureDate,
      };
      const tenant: Partial<Tenant> = {
        id: 't-1',
        eid: '12345',
        tssd: 'test-tssd',
      };

      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(
        credential as Credential,
      );
      vi.mocked(tenantRepo.findById).mockResolvedValueOnce(tenant as Tenant);

      const encryptionService =
        module.get<EncryptionService>(EncryptionService);
      vi.mocked(encryptionService.decrypt).mockImplementationOnce(() => {
        throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
          reason: 'ENCRYPTION_KEY not configured',
        });
      });

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1', false);
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.CONFIG_ERROR);
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.CONFIG_ERROR],
        );
      }
    });

    it('throws CONFIG_ERROR when MCE client credentials not configured', async () => {
      const credential: Partial<Credential> = {
        userId: 'u-1',
        tenantId: 't-1',
        mid: 'mid-1',
        refreshToken: 'encrypted-refresh-token',
        expiresAt: new Date(Date.now() - 1000),
      };
      const tenant: Partial<Tenant> = {
        id: 't-1',
        eid: '12345',
        tssd: 'test-tssd',
      };

      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(
        credential as Credential,
      );
      vi.mocked(tenantRepo.findById).mockResolvedValueOnce(tenant as Tenant);

      const configService = module.get<ConfigService>(ConfigService);
      vi.mocked(configService.get).mockImplementation((key: string) => {
        if (key === 'MCE_CLIENT_ID') {
          return undefined;
        }
        if (key === 'MCE_CLIENT_SECRET') {
          return 'client-secret';
        }
        return 'some-value';
      });

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1', true);
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.CONFIG_ERROR);
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.CONFIG_ERROR],
        );
      }
    });

    it('throws MCE_AUTH_EXPIRED when MCE returns access_denied', async () => {
      server.use(
        http.post(
          'https://test-tssd.auth.marketingcloudapis.com/v2/token',
          () =>
            HttpResponse.json(
              { error: 'access_denied', error_description: 'Access revoked' },
              { status: 401 },
            ),
        ),
      );

      const encryptionKey =
        '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
      const encryptedRefreshToken = encrypt(
        'valid-refresh-token',
        encryptionKey,
      );

      const credential: Partial<Credential> = {
        userId: 'u-1',
        tenantId: 't-1',
        mid: 'mid-1',
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      const tenant: Partial<Tenant> = {
        id: 't-1',
        eid: '12345',
        tssd: 'test-tssd',
      };

      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(
        credential as Credential,
      );
      vi.mocked(tenantRepo.findById).mockResolvedValueOnce(tenant as Tenant);

      const configService = module.get<ConfigService>(ConfigService);
      vi.mocked(configService.get).mockImplementation((key: string) => {
        if (key === 'ENCRYPTION_KEY') {
          return encryptionKey;
        }
        if (key === 'MCE_CLIENT_ID') {
          return 'client-id';
        }
        if (key === 'MCE_CLIENT_SECRET') {
          return 'client-secret';
        }
        return 'some-value';
      });

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1', true);
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.MCE_AUTH_EXPIRED);
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.MCE_AUTH_EXPIRED],
        );
      }
    });

    it('throws MCE_AUTH_EXPIRED when MCE returns invalid_grant', async () => {
      server.use(
        http.post(
          'https://test-tssd.auth.marketingcloudapis.com/v2/token',
          () =>
            HttpResponse.json(
              { error: 'invalid_grant', error_description: 'Grant expired' },
              { status: 401 },
            ),
        ),
      );

      const encryptionKey =
        '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
      const encryptedRefreshToken = encrypt(
        'valid-refresh-token',
        encryptionKey,
      );

      const credential: Partial<Credential> = {
        userId: 'u-1',
        tenantId: 't-1',
        mid: 'mid-1',
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() - 1000),
      };
      const tenant: Partial<Tenant> = {
        id: 't-1',
        eid: '12345',
        tssd: 'test-tssd',
      };

      vi.mocked(credRepo.findByUserTenantMid).mockResolvedValueOnce(
        credential as Credential,
      );
      vi.mocked(tenantRepo.findById).mockResolvedValueOnce(tenant as Tenant);

      const configService = module.get<ConfigService>(ConfigService);
      vi.mocked(configService.get).mockImplementation((key: string) => {
        if (key === 'ENCRYPTION_KEY') {
          return encryptionKey;
        }
        if (key === 'MCE_CLIENT_ID') {
          return 'client-id';
        }
        if (key === 'MCE_CLIENT_SECRET') {
          return 'client-secret';
        }
        return 'some-value';
      });

      try {
        await service.refreshToken('t-1', 'u-1', 'mid-1', true);
        expect.fail('Expected AppError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).code).toBe(ErrorCode.MCE_AUTH_EXPIRED);
        expect((error as AppError).message).toBe(
          ErrorMessages[ErrorCode.MCE_AUTH_EXPIRED],
        );
      }
    });
  });
});
