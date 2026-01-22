import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ICredentialsRepository,
  ITenantRepository,
  IUserRepository,
} from "@qpp/database";
import { decrypt, encrypt } from "@qpp/database";
import axios from "axios";
import * as jose from "jose";

import { AppError, ErrorCode } from "../common/errors";
import { RlsContextService } from "../database/rls-context.service";
import { SeatLimitService } from "./seat-limit.service";

export interface MceTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  rest_instance_url: string;
  soap_instance_url: string;
  scope: string;
  token_type: string;
}

type RefreshTokenResult = {
  accessToken: string;
  tssd: string;
  didRefresh: boolean;
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly refreshLocks = new Map<
    string,
    Promise<RefreshTokenResult>
  >();
  private readonly allowedJwtAlgorithms: jose.JWTVerifyOptions["algorithms"] = [
    "HS256",
  ];

  constructor(
    private configService: ConfigService,
    @Inject("TENANT_REPOSITORY") private tenantRepo: ITenantRepository,
    @Inject("USER_REPOSITORY") private userRepo: IUserRepository,
    @Inject("CREDENTIALS_REPOSITORY") private credRepo: ICredentialsRepository,
    private readonly rlsContext: RlsContextService,
    private readonly seatLimitService: SeatLimitService,
  ) {}

  async verifyMceJwt(jwt: string) {
    const secret = this.configService.get<string>("MCE_JWT_SIGNING_SECRET");
    if (!secret) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "MCE_JWT_SIGNING_SECRET not configured",
      });
    }

    try {
      const encodedSecret = new TextEncoder().encode(secret);
      const issuer =
        this.configService.get<string>("MCE_JWT_ISSUER") ?? undefined;
      const audience =
        this.configService.get<string>("MCE_JWT_AUDIENCE") ?? undefined;

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
        typeof payload.application_context === "object"
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
        throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, undefined, {
          reason: "JWT missing required identity claims",
        });
      }

      if (!tssd) {
        throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, undefined, {
          reason: "Could not determine TSSD from JWT",
        });
      }

      return {
        sfUserId,
        eid,
        mid,
        tssd: this.assertValidTssd(tssd),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      this.logger.error(
        "JWT Verification failed",
        error instanceof Error ? error.stack : error,
      );
      throw new AppError(
        ErrorCode.AUTH_UNAUTHORIZED,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async getTokensViaClientCredentials(
    tssd: string,
    accountId?: string,
  ): Promise<MceTokenResponse> {
    const clientId = this.configService.get<string>("MCE_CLIENT_ID");
    const clientSecret = this.configService.get<string>("MCE_CLIENT_SECRET");
    const tokenUrl = `https://${tssd}.auth.marketingcloudapis.com/v2/token`;

    if (!clientId || !clientSecret) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "MCE_CLIENT_ID/MCE_CLIENT_SECRET not configured",
      });
    }

    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    });

    if (accountId) {
      body.set("account_id", accountId);
    }

    const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });

    return response.data;
  }

  async handleJwtLogin(jwt: string) {
    const { sfUserId, eid, mid, tssd } = await this.verifyMceJwt(jwt);

    const tokenData = await this.getTokensViaClientCredentials(tssd, mid);

    const tenant = await this.tenantRepo.upsert({ eid, tssd });

    // sfUserId is a Salesforce User ID (18-char format), which is globally unique
    // across all MCE enterprises. A user belongs to exactly one MCE enterprise,
    // so we check globally rather than per-tenant.
    const existingUser = await this.userRepo.findBySfUserId(sfUserId);

    if (!existingUser) {
      await this.seatLimitService.checkSeatLimit(tenant.id);
    }

    const user = await this.userRepo.upsert({
      sfUserId,
      tenantId: tenant.id,
    });

    await this.saveTokens(tenant.id, user.id, mid, tokenData);

    return { user, tenant, mid };
  }

  async findUserById(id: string) {
    return this.userRepo.findById(id);
  }

  async findTenantById(id: string) {
    return this.tenantRepo.findById(id);
  }

  getAuthUrl(tssd: string, state: string): string {
    const clientId = this.configService.get<string>("MCE_CLIENT_ID");
    const redirectUri =
      this.configService.get<string>("MCE_REDIRECT_URI") ?? "";
    if (!clientId || !redirectUri) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "MCE_CLIENT_ID/MCE_REDIRECT_URI not configured",
      });
    }
    return `https://${tssd}.auth.marketingcloudapis.com/v2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(
    tssd: string,
    code: string,
    fallbackCode?: string,
    accountId?: string,
  ): Promise<MceTokenResponse> {
    const clientId = this.configService.get<string>("MCE_CLIENT_ID");
    const clientSecret = this.configService.get<string>("MCE_CLIENT_SECRET");
    const redirectUri = this.configService.get<string>("MCE_REDIRECT_URI");

    const tokenUrl = `https://${tssd}.auth.marketingcloudapis.com/v2/token`;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason:
          "MCE_CLIENT_ID/MCE_CLIENT_SECRET/MCE_REDIRECT_URI not configured",
      });
    }

    const codes =
      fallbackCode && fallbackCode !== code ? [code, fallbackCode] : [code];

    for (const attemptCode of codes) {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: attemptCode,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });

      if (accountId) {
        body.set("account_id", accountId);
      }

      try {
        const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        });
        return response.data;
      } catch (error) {
        const errorCode = this.getOAuthErrorCode(error);
        const isLastAttempt = attemptCode === codes[codes.length - 1];

        if (!isLastAttempt && errorCode === "invalid_token") {
          this.logger.warn(
            "Auth code exchange failed, retrying with alternate code",
          );
          continue;
        }

        this.logTokenError("Auth code exchange failed", error);
        throw new AppError(
          ErrorCode.AUTH_UNAUTHORIZED,
          error instanceof Error ? error : undefined,
        );
      }
    }

    throw new AppError(ErrorCode.AUTH_UNAUTHORIZED);
  }

  async refreshToken(
    tenantId: string,
    userId: string,
    mid: string,
    forceRefresh = false,
  ): Promise<{ accessToken: string; tssd: string }> {
    const lockKey = `${tenantId}:${userId}:${mid}`;
    while (true) {
      const existingLock = this.refreshLocks.get(lockKey);
      if (existingLock) {
        const result = await existingLock;
        if (!forceRefresh || result.didRefresh) {
          return { accessToken: result.accessToken, tssd: result.tssd };
        }
        continue;
      }

      const refreshPromise = this.refreshTokenInternal(
        tenantId,
        userId,
        mid,
        forceRefresh,
      );
      this.refreshLocks.set(lockKey, refreshPromise);

      try {
        const result = await refreshPromise;
        return { accessToken: result.accessToken, tssd: result.tssd };
      } finally {
        if (this.refreshLocks.get(lockKey) === refreshPromise) {
          this.refreshLocks.delete(lockKey);
        }
      }
    }
  }

  async invalidateToken(
    tenantId: string,
    userId: string,
    mid: string,
  ): Promise<void> {
    const creds = await this.credRepo.findByUserTenantMid(
      userId,
      tenantId,
      mid,
    );
    if (!creds) {
      return;
    }

    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      await this.credRepo.upsert({
        tenantId,
        userId,
        mid,
        accessToken: creds.accessToken,
        refreshToken: creds.refreshToken,
        expiresAt: new Date(0),
        updatedAt: new Date(),
      });
    });
  }

  async saveTokens(
    tenantId: string,
    userId: string,
    mid: string,
    tokenData: MceTokenResponse,
  ) {
    const encryptionKey = this.configService.get<string>("ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new AppError(ErrorCode.CONFIG_ERROR, undefined, {
        reason: "ENCRYPTION_KEY not configured",
      });
    }
    const encryptedAccessToken = encrypt(tokenData.access_token, encryptionKey);
    const encryptedRefreshToken = encrypt(
      tokenData.refresh_token,
      encryptionKey,
    );

    await this.rlsContext.runWithTenantContext(tenantId, mid, async () => {
      await this.credRepo.upsert({
        tenantId,
        userId,
        mid,
        accessToken: encryptedAccessToken,
        refreshToken: encryptedRefreshToken,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        updatedAt: new Date(),
      });
    });
  }

  async getUserInfo(tssd: string, accessToken: string) {
    const url = `https://${tssd}.auth.marketingcloudapis.com/v2/userinfo`;
    const response = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    return response.data;
  }

  async handleCallback(
    tssd: string,
    code: string,
    sfUserId?: string,
    eid?: string,
    email?: string,
    name?: string,
    mid?: string,
  ) {
    const embedded = this.extractAuthCode(code);
    const embeddedEid = embedded?.eid;
    const fallbackCode = embedded?.authCode;

    const tokenData = await this.exchangeCodeForToken(
      tssd,
      code,
      fallbackCode,
      mid,
    );

    const info = await this.getUserInfo(tssd, tokenData.access_token);

    if (!info?.sub && !info?.user_id && !info?.user?.sub) {
      this.logger.warn("Userinfo response missing user identifiers", {
        keys: Object.keys(info ?? {}),
        userKeys: Object.keys(info?.user ?? {}),
        orgKeys: Object.keys(info?.organization ?? {}),
      });
    }

    const derivedSfUserId =
      this.coerceId(info.sub) ??
      this.coerceId(info.user_id) ??
      this.coerceId(info.user?.sub) ??
      this.coerceId(info.user?.id) ??
      this.coerceId(info.user?.user_id) ??
      this.extractIdFromObject(info.user, [
        "userId",
        "userID",
        "memberId",
        "member_id",
      ]);
    const derivedEid =
      this.coerceId(info.enterprise_id) ??
      this.coerceId(info.organization?.enterprise_id) ??
      this.coerceId(info.organization?.id) ??
      this.coerceId(info.organization?.org_id) ??
      this.extractIdFromObject(info.organization, [
        "enterpriseId",
        "enterpriseID",
        "orgId",
        "orgID",
        "eid",
      ]);
    const derivedMid =
      this.coerceId(info.member_id) ??
      this.coerceId(info.user?.member_id) ??
      this.coerceId(info.organization?.member_id) ??
      this.extractIdFromObject(info.user, ["mid", "member_id", "memberId"]) ??
      this.extractIdFromObject(info.organization, [
        "mid",
        "member_id",
        "memberId",
      ]);

    const providedSfUserId = this.coerceId(sfUserId);
    const providedEid = this.coerceId(eid) ?? this.coerceId(embeddedEid);
    const providedMid = this.coerceId(mid);

    if (
      providedSfUserId &&
      derivedSfUserId &&
      providedSfUserId !== derivedSfUserId
    ) {
      throw new AppError(ErrorCode.AUTH_IDENTITY_MISMATCH);
    }
    if (providedEid && derivedEid && providedEid !== derivedEid) {
      throw new AppError(ErrorCode.AUTH_IDENTITY_MISMATCH);
    }
    if (providedMid && derivedMid && providedMid !== derivedMid) {
      throw new AppError(ErrorCode.AUTH_IDENTITY_MISMATCH);
    }

    const effectiveSfUserId = derivedSfUserId ?? providedSfUserId;
    const effectiveEid = derivedEid ?? providedEid;
    const effectiveMid = derivedMid ?? providedMid;
    const effectiveEmail = info.email ?? info.user?.email ?? email;
    const effectiveName =
      info.name ?? info.user?.name ?? info.user?.full_name ?? name;

    if (!effectiveSfUserId || !effectiveEid || !effectiveMid) {
      throw new AppError(ErrorCode.AUTH_UNAUTHORIZED, undefined, {
        reason: "Could not determine MCE User ID, Enterprise ID, or MID",
      });
    }

    const tenant = await this.tenantRepo.upsert({ eid: effectiveEid, tssd });

    // sfUserId is a Salesforce User ID (18-char format), which is globally unique
    // across all MCE enterprises. A user belongs to exactly one MCE enterprise,
    // so we check globally rather than per-tenant.
    const existingUser = await this.userRepo.findBySfUserId(effectiveSfUserId);

    if (!existingUser) {
      await this.seatLimitService.checkSeatLimit(tenant.id);
    }

    const user = await this.userRepo.upsert({
      sfUserId: effectiveSfUserId,
      tenantId: tenant.id,
      email: effectiveEmail,
      name: effectiveName,
    });

    await this.saveTokens(tenant.id, user.id, effectiveMid, tokenData);

    return { user, tenant, mid: effectiveMid };
  }

  private extractIdFromObject(
    obj: Record<string, unknown> | undefined,
    keys: string[],
  ): string | undefined {
    if (!obj) {
      return undefined;
    }

    for (const key of keys) {
      // eslint-disable-next-line security/detect-object-injection -- `key` comes from hardcoded array parameter, not user input
      const value = obj[key];
      const direct = this.coerceId(value);
      if (direct) {
        return direct;
      }

      if (value && typeof value === "object") {
        const nested = value as Record<string, unknown>;
        const nestedId = this.coerceId(nested.id ?? nested.value);
        if (nestedId) {
          return nestedId;
        }
      }
    }

    return undefined;
  }

  private coerceId(value: unknown): string | undefined {
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : undefined;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }

    return undefined;
  }

  private extractAuthCode(
    code: string,
  ): { authCode: string; eid?: string } | undefined {
    if (!code.includes(".")) {
      return undefined;
    }
    const parts = code.split(".");
    const encodedPayload = parts[1];
    if (!encodedPayload) {
      return undefined;
    }

    try {
      const payloadJson = Buffer.from(encodedPayload, "base64url").toString(
        "utf8",
      );
      const payload = JSON.parse(payloadJson) as {
        auth_code?: string;
        eid?: number | string;
      };
      if (!payload.auth_code) {
        return undefined;
      }
      return {
        authCode: payload.auth_code,
        eid: payload.eid ? String(payload.eid) : undefined,
      };
    } catch (error) {
      this.logger.debug(
        "Failed to parse embedded auth code",
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
        `${message} (${status ?? "unknown status"})`,
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
    if (!axios.isAxiosError(error)) {
      return undefined;
    }

    const data = error.response?.data;
    if (!data || typeof data !== "object") {
      return undefined;
    }

    const errorCode = (data as { error?: string }).error;
    return errorCode ? String(errorCode) : undefined;
  }

  private async refreshTokenInternal(
    tenantId: string,
    userId: string,
    mid: string,
    forceRefresh: boolean,
  ): Promise<RefreshTokenResult> {
    const creds = await this.credRepo.findByUserTenantMid(
      userId,
      tenantId,
      mid,
    );
    if (!creds) {
      this.logger.warn({
        message: "MCE credentials not found",
        userId,
        tenantId,
        mid,
      });
      throw new AppError(ErrorCode.MCE_CREDENTIALS_MISSING, undefined, {
        userId,
        tenantId,
        mid,
      });
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      this.logger.warn({ message: "Tenant not found", tenantId });
      throw new AppError(ErrorCode.MCE_TENANT_NOT_FOUND, undefined, {
        tenantId,
      });
    }

    if (
      !forceRefresh &&
      creds.accessToken &&
      this.isAccessTokenValid(creds.expiresAt)
    ) {
      const encryptionKey = this.configService.get<string>("ENCRYPTION_KEY");
      if (!encryptionKey) {
        throw new AppError(ErrorCode.CONFIG_ERROR);
      }
      const decryptedAccessToken = decrypt(creds.accessToken, encryptionKey);
      return {
        accessToken: decryptedAccessToken,
        tssd: tenant.tssd,
        didRefresh: false,
      };
    }

    const encryptionKey = this.configService.get<string>("ENCRYPTION_KEY");
    if (!encryptionKey) {
      throw new AppError(ErrorCode.CONFIG_ERROR);
    }

    const decryptedRefreshToken = decrypt(creds.refreshToken, encryptionKey);
    const clientId = this.configService.get<string>("MCE_CLIENT_ID");
    const clientSecret = this.configService.get<string>("MCE_CLIENT_SECRET");
    const tokenUrl = `https://${tenant.tssd}.auth.marketingcloudapis.com/v2/token`;

    try {
      if (!clientId || !clientSecret) {
        throw new AppError(ErrorCode.CONFIG_ERROR);
      }

      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      });

      body.set("account_id", mid);

      const response = await axios.post<MceTokenResponse>(tokenUrl, body, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      const tokenData = response.data;
      await this.saveTokens(tenant.id, userId, mid, tokenData);
      return {
        accessToken: tokenData.access_token,
        tssd: tenant.tssd,
        didRefresh: true,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const data = error.response?.data;
        const errorCode =
          data && typeof data === "object" && "error" in data
            ? typeof (data as { error?: unknown }).error === "string"
              ? (data as { error?: string }).error
              : ""
            : "";
        if (errorCode === "access_denied" || errorCode === "invalid_grant") {
          throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, error);
        }
      }
      this.logTokenError("Refresh token failed", error);
      throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, error);
    }
  }

  private isAccessTokenValid(expiresAt: Date | string | null): boolean {
    if (!expiresAt) {
      return false;
    }
    const expiry =
      expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(expiresAt);
    if (!Number.isFinite(expiry)) {
      return false;
    }

    return Date.now() < expiry - 60_000;
  }

  private assertValidTssd(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, undefined, {
        reason: "TSSD is empty",
      });
    }

    if (!/^[a-z0-9-]+$/i.test(trimmed)) {
      throw new AppError(ErrorCode.MCE_AUTH_EXPIRED, undefined, {
        reason: "TSSD has invalid format",
      });
    }

    return trimmed.toLowerCase();
  }
}
