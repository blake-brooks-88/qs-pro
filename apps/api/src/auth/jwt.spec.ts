import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuthService,
  RlsContextService,
  SeatLimitService,
} from '@qpp/backend-shared';
import * as jose from 'jose';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('AuthService JWT Verification', () => {
  let service: AuthService;
  const secret = 'secret-key-at-least-32-chars-long-!!!';
  const encodedSecret = new TextEncoder().encode(secret);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              if (key === 'MCE_JWT_SIGNING_SECRET') {
                return secret;
              }
              return null;
            }),
          },
        },
        { provide: 'TENANT_REPOSITORY', useValue: {} },
        { provide: 'USER_REPOSITORY', useValue: {} },
        { provide: 'CREDENTIALS_REPOSITORY', useValue: {} },
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
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  async function createJwt(
    payload: jose.JWTPayload,
    options: { expiresAt?: string | number | Date } = {},
  ) {
    let builder = new jose.SignJWT(payload).setProtectedHeader({
      alg: 'HS256',
    });

    if (options.expiresAt) {
      builder = builder.setExpirationTime(options.expiresAt);
    } else {
      builder = builder.setExpirationTime('1h');
    }

    return builder.sign(encodedSecret);
  }

  it('should verify a valid JWT and extract context', async () => {
    const payload = {
      user_id: 'sf-user-123',
      enterprise_id: 'eid-456',
      member_id: 'mid-789',
      stack: 's11',
    };
    const jwt = await createJwt(payload);

    const result = await service.verifyMceJwt(jwt);
    expect(result).toMatchObject({
      sfUserId: payload.user_id,
      eid: payload.enterprise_id,
      mid: payload.member_id,
      tssd: payload.stack,
    });
  });

  it('should throw error for invalid signature', async () => {
    const jwt = await createJwt({ foo: 'bar' });
    const invalidJwt = jwt.slice(0, -5) + 'abcde';

    await expect(service.verifyMceJwt(invalidJwt)).rejects.toThrow();
  });

  it('should throw error for expired token', async () => {
    const jwt = await createJwt({ foo: 'bar' }, { expiresAt: '-1s' });
    await expect(service.verifyMceJwt(jwt)).rejects.toThrow();
  });

  it('should extract TSSD from application_context if stack is missing', async () => {
    const payload = {
      user_id: 'sf-user-123',
      enterprise_id: 'eid-456',
      member_id: 'mid-789',
      application_context: {
        base_url: 'https://mc-123.rest.marketingcloudapis.com/',
      },
    };
    const jwt = await createJwt(payload);
    const result = await service.verifyMceJwt(jwt);
    expect(result.tssd).toBe('mc-123');
  });
});
