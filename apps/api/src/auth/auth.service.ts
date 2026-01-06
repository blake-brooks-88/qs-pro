import {
  Injectable,
  Inject,
  UnauthorizedException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as jose from 'jose';
import { encrypt, decrypt } from '@qs-pro/database';
import type {
  ITenantRepository,
  IUserRepository,
  ICredentialsRepository,
} from '@qs-pro/database';

export interface MceTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  rest_instance_url: string;
  soap_instance_url: string;
  scope: string;
  token_type: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshLocks = new Map<
    string,
    Promise<{ accessToken: string; tssd: string }>
  >();
  private readonly allowedJwtAlgorithms: jose.JWTVerifyOptions['algorithms'] = [
    'HS256',
  ];

  constructor(
    private configService: ConfigService,
    @Inject('TENANT_REPOSITORY') private tenantRepo: ITenantRepository,
    @Inject('USER_REPOSITORY') private userRepo: IUserRepository,
    @Inject('CREDENTIALS_REPOSITORY') private credRepo: ICredentialsRepository,
  ) {}

  async verifyMceJwt(jwt: string) {
    const secret = this.configService.get<string>('MCE_JWT_SIGNING_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'MCE_JWT_SIGNING_SECRET not configured',
      );
    }

    try {
      const encodedSecret = new TextEncoder().encode(secret);
      const issuer = this.configService.get<string>('MCE_JWT_ISSUER') ?? undefined;
      const audience =
        this.configService.get<string>('MCE_JWT_AUDIENCE') ?? undefined;

      const { payload } = await jose.jwtVerify(jwt, encodedSecret, {
        algorithms: this.allowedJwtAlgorithms,
        issuer,
        audience,
      });

      const sfUserId = this.coerceId(payload.user_id);
      const eid = this.coerceId(payload.enterprise_id);
      const mid = this.coerceId(payload.member_id);

      let tssd = this.coerceId(payload.stack);
      if (
        !tssd &&
        payload.application_context &&
        typeof payload.application_context === 'object'
      ) {
        const appContext = payload.application_context as Record<
          string,
          unknown
        >;
        const baseUrl = this.coerceId(appContext.base_url);
        const match =
          baseUrl?.match(
            /^https:\/\/([a-z0-9-]+)\.rest\.marketingcloudapis\.com(?:\/|$)/i,
          ) ?? undefined;
        if (match) {
          tssd = match[1];
        }
      }

      if (!sfUserId || !eid || !mid) {
        throw new Error('JWT missing required identity claims');
      }

      if (!tssd) {
        throw new Error('Could not determine TSSD from JWT');
      }

      return {
        sfUserId,
        eid,
        mid,
        tssd: this.assertValidTssd(tssd),
      };
    } catch (error) {
      this.logger.error(
        'JWT Verification failed',
        error instanceof Error ? error.stack : error,
      );
      throw new UnauthorizedException('Invalid MCE JWT');
    }
  }

  async getTokensViaClientCredentials(
    tssd: string,
    accountId?: string,
  ): Promise<MceTokenResponse> {
    const clientId = this.configService.get<string>('MCE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MCE_CLIENT_SECRET');
    const tokenUrl = `https://${tssd}.auth.marketingcloudapis.com/v2/token`;

    if (!clientId || !clientSecret) {
      throw new InternalServerErrorException(
        'MCE client credentials not configured',
      );
    }

    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    if (accountId) {
      body.set('account_id', accountId);
    }

    const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    return response.data;
  }

  async handleJwtLogin(jwt: string) {
    const { sfUserId, eid, mid, tssd } = await this.verifyMceJwt(jwt);

    // Exchange for tokens using MID (member_id) context
    const tokenData = await this.getTokensViaClientCredentials(tssd, mid);

    // JIT Provisioning
    const tenant = await this.tenantRepo.upsert({ eid, tssd });

    // MCE JWT doesn't always have email/name. We can fetch it if needed or leave it.
    // For now, we'll try to use what's in handleCallback if we had a code,
    // but here we just have a JWT.
    const user = await this.userRepo.upsert({
      sfUserId,
      tenantId: tenant.id,
    });

    await this.saveTokens(tenant.id, user.id, tokenData);

    return { user, tenant };
  }

  async findUserById(id: string) {
    return this.userRepo.findById(id);
  }

  async findTenantById(id: string) {
    return this.tenantRepo.findById(id);
  }

  getAuthUrl(tssd: string, state: string): string {
    const clientId = this.configService.get<string>('MCE_CLIENT_ID');
    const redirectUri =
      this.configService.get<string>('MCE_REDIRECT_URI') || '';
    if (!clientId || !redirectUri) {
      throw new InternalServerErrorException('MCE OAuth config not complete');
    }
    return `https://${tssd}.auth.marketingcloudapis.com/v2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(
    tssd: string,
    code: string,
    fallbackCode?: string,
  ): Promise<MceTokenResponse> {
    const clientId = this.configService.get<string>('MCE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MCE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>('MCE_REDIRECT_URI');

    const tokenUrl = `https://${tssd}.auth.marketingcloudapis.com/v2/token`;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new InternalServerErrorException('MCE OAuth config not complete');
    }

    const codes =
      fallbackCode && fallbackCode !== code ? [code, fallbackCode] : [code];

    for (const attemptCode of codes) {
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: attemptCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });

      try {
        const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });
        return response.data;
      } catch (error) {
        const errorCode = this.getOAuthErrorCode(error);
        const isLastAttempt = attemptCode === codes[codes.length - 1];

        if (!isLastAttempt && errorCode === 'invalid_token') {
          this.logger.warn(
            'Auth code exchange failed, retrying with alternate code',
          );
          continue;
        }

        this.logTokenError('Auth code exchange failed', error);
        throw new UnauthorizedException('Failed to exchange authorization code');
      }
    }

    throw new UnauthorizedException('Failed to exchange authorization code');
  }

  async refreshToken(
    tenantId: string,
    userId: string,
  ): Promise<{ accessToken: string; tssd: string }> {
    const lockKey = `${tenantId}:${userId}`;
    const existingLock = this.refreshLocks.get(lockKey);
    if (existingLock) {
      return existingLock;
    }

    const refreshPromise = this.refreshTokenInternal(tenantId, userId);
    this.refreshLocks.set(lockKey, refreshPromise);

    try {
      return await refreshPromise;
    } finally {
      this.refreshLocks.delete(lockKey);
    }
  }

  async saveTokens(
    tenantId: string,
    userId: string,
    tokenData: MceTokenResponse,
  ) {
    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new InternalServerErrorException('ENCRYPTION_KEY not configured');
    }
    const encryptedAccessToken = encrypt(tokenData.access_token, encryptionKey);
    const encryptedRefreshToken = encrypt(
      tokenData.refresh_token,
      encryptionKey,
    );

    await this.credRepo.upsert({
      tenantId,
      userId,
      accessToken: encryptedAccessToken,
      refreshToken: encryptedRefreshToken,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
      updatedAt: new Date(),
    });
  }

  async getUserInfo(tssd: string, accessToken: string) {
    const url = `https://${tssd}.auth.marketingcloudapis.com/v2/userinfo`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data; // contains enterprise_id, sub (user_id), email, name
  }

  async handleCallback(
    tssd: string,
    code: string,
    sfUserId?: string,
    eid?: string,
    email?: string,
    name?: string,
  ) {
    const embedded = this.extractAuthCode(code);
    const embeddedEid = embedded?.eid;
    const fallbackCode = embedded?.authCode;

    // 1. Exchange code
    const tokenData = await this.exchangeCodeForToken(
      tssd,
      code,
      fallbackCode,
    );

    // 2. Discover missing info if necessary
    let effectiveSfUserId = sfUserId;
    let effectiveEid = eid || embeddedEid;
    let effectiveEmail = email;
    let effectiveName = name;

    if (!effectiveSfUserId || !effectiveEid) {
      const info = await this.getUserInfo(tssd, tokenData.access_token);
      if (!info?.sub && !info?.user_id && !info?.user?.sub) {
        this.logger.warn('Userinfo response missing user identifiers', {
          keys: Object.keys(info ?? {}),
          userKeys: Object.keys(info?.user ?? {}),
          orgKeys: Object.keys(info?.organization ?? {}),
        });
      }
      effectiveSfUserId =
        effectiveSfUserId ||
        this.coerceId(info.sub) ||
        this.coerceId(info.user_id) ||
        this.coerceId(info.user?.sub) ||
        this.coerceId(info.user?.id) ||
        this.coerceId(info.user?.user_id) ||
        this.extractIdFromObject(info.user, [
          'userId',
          'userID',
          'memberId',
          'member_id',
        ]);
      effectiveEid =
        effectiveEid ||
        this.coerceId(info.enterprise_id) ||
        this.coerceId(info.organization?.enterprise_id) ||
        this.coerceId(info.organization?.id) ||
        this.coerceId(info.organization?.org_id) ||
        this.extractIdFromObject(info.organization, [
          'enterpriseId',
          'enterpriseID',
          'orgId',
          'orgID',
          'eid',
        ]);
      effectiveEmail = effectiveEmail || info.email || info.user?.email;
      effectiveName =
        effectiveName || info.name || info.user?.name || info.user?.full_name;
    }

    if (!effectiveSfUserId || !effectiveEid) {
      throw new UnauthorizedException(
        'Could not determine MCE User ID or Enterprise ID',
      );
    }

    // 3. Ensure tenant exists
    const tenant = await this.tenantRepo.upsert({ eid: effectiveEid, tssd });

    // 4. Ensure user exists
    const user = await this.userRepo.upsert({
      sfUserId: effectiveSfUserId,
      tenantId: tenant.id,
      email: effectiveEmail,
      name: effectiveName,
    });

    // 5. Save tokens
    await this.saveTokens(tenant.id, user.id, tokenData);

    return { user, tenant };
  }

  private extractIdFromObject(
    obj: Record<string, unknown> | undefined,
    keys: string[],
  ): string | undefined {
    if (!obj) return undefined;

    for (const key of keys) {
      const value = obj[key];
      const direct = this.coerceId(value);
      if (direct) return direct;

      if (value && typeof value === 'object') {
        const nested = value as Record<string, unknown>;
        const nestedId = this.coerceId(nested.id ?? nested.value);
        if (nestedId) return nestedId;
      }
    }

    return undefined;
  }

  private coerceId(value: unknown): string | undefined {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private extractAuthCode(
    code: string,
  ): { authCode: string; eid?: string } | undefined {
    if (!code.includes('.')) return undefined;
    const parts = code.split('.');
    if (parts.length < 2) return undefined;

    try {
      const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
      const payload = JSON.parse(payloadJson) as {
        auth_code?: string;
        eid?: number | string;
      };
      if (!payload.auth_code) return undefined;
      return {
        authCode: payload.auth_code,
        eid: payload.eid ? String(payload.eid) : undefined,
      };
    } catch (error) {
      this.logger.debug(
        'Failed to parse embedded auth code',
        error instanceof Error ? error.stack : error,
      );
      return undefined;
    }
  }

  private logTokenError(message: string, error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      this.logger.error(
        `${message} (${status ?? 'unknown status'})`,
        data ? JSON.stringify(data) : undefined,
      );
      return;
    }

    this.logger.error(
      message,
      error instanceof Error ? error.stack : String(error),
    );
  }

  private getOAuthErrorCode(error: unknown): string | undefined {
    if (!axios.isAxiosError(error)) return undefined;

    const data = error.response?.data;
    if (!data || typeof data !== 'object') return undefined;

    const errorCode = (data as { error?: string }).error;
    return errorCode ? String(errorCode) : undefined;
  }

  private async refreshTokenInternal(
    tenantId: string,
    userId: string,
  ): Promise<{ accessToken: string; tssd: string }> {
    const creds = await this.credRepo.findByUserAndTenant(userId, tenantId);
    if (!creds) throw new UnauthorizedException('No credentials found');

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) throw new UnauthorizedException('Tenant not found');

    if (creds.accessToken && this.isAccessTokenValid(creds.expiresAt)) {
      const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
      if (!encryptionKey) {
        throw new InternalServerErrorException('ENCRYPTION_KEY not configured');
      }
      const decryptedAccessToken = decrypt(creds.accessToken, encryptionKey);
      return { accessToken: decryptedAccessToken, tssd: tenant.tssd };
    }

    const encryptionKey = this.configService.get<string>('ENCRYPTION_KEY');
    if (!encryptionKey) {
      throw new InternalServerErrorException('ENCRYPTION_KEY not configured');
    }

    const decryptedRefreshToken = decrypt(creds.refreshToken, encryptionKey);
    const clientId = this.configService.get<string>('MCE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('MCE_CLIENT_SECRET');
    const tokenUrl = `https://${tenant.tssd}.auth.marketingcloudapis.com/v2/token`;

    try {
      if (!clientId || !clientSecret) {
        throw new InternalServerErrorException(
          'MCE client credentials not configured',
        );
      }

      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: decryptedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });

      const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });

      const tokenData = response.data;
      await this.saveTokens(tenant.id, userId, tokenData);
      return { accessToken: tokenData.access_token, tssd: tenant.tssd };
    } catch (error) {
      this.logTokenError('Refresh token failed', error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  private isAccessTokenValid(expiresAt: Date | string | null): boolean {
    if (!expiresAt) return false;
    const expiry =
      expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
    if (!Number.isFinite(expiry)) return false;

    // Refresh ~1 minute early to avoid edge races.
    return Date.now() < expiry - 60_000;
  }

  private assertValidTssd(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error('TSSD is empty');
    }

    // Restrict to the expected stack subdomain format to prevent host injection.
    if (!/^[a-z0-9-]+$/i.test(trimmed)) {
      throw new Error('TSSD has invalid format');
    }

    return trimmed.toLowerCase();
  }
}
