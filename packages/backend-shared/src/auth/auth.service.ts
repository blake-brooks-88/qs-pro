import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  ICredentialsRepository,
  ITenantRepository,
  IUserRepository,
} from "@qpp/database";
import axios from "axios";
import * as jose from "jose";

import { AppError, ErrorCode, safeContext } from "../common/errors";
import { RlsContextService } from "../database/rls-context.service";
import { EncryptionService } from "../encryption";
import { SeatLimitService } from "./seat-limit.service";

const MCE_HTTP_TIMEOUT_MS = 15_000;

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
    private readonly encryptionService: EncryptionService,
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
      timeout: MCE_HTTP_TIMEOUT_MS,
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
    embeddedCode?: string,
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

    const codes = this.buildCodeExchangeAttempts(code, embeddedCode);
    this.logger.log(
      `OAuth token exchange starting tssd=${tssd} attempts=${codes.length} hasAccountId=${Boolean(accountId)}`,
    );

    for (const [index, attemptCode] of codes.entries()) {
      const attemptStartedAt = Date.now();
      const attemptSource =
        embeddedCode && attemptCode === embeddedCode ? "embedded" : "original";
      this.logger.log(
        `OAuth token exchange attempt ${index + 1}/${codes.length} source=${attemptSource} codeLen=${attemptCode.length}`,
      );

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
          timeout: MCE_HTTP_TIMEOUT_MS,
        });
        this.logger.log(
          `OAuth token exchange succeeded attempt=${index + 1} durationMs=${Date.now() - attemptStartedAt}`,
        );
        return response.data;
      } catch (error) {
        const errorCode = this.getOAuthErrorCode(error);
        const status = this.getAxiosStatus(error);
        const networkCode = this.getAxiosNetworkCode(error);
        const isLastAttempt = attemptCode === codes[codes.length - 1];
        const shouldRetry =
          !isLastAttempt &&
          this.shouldTryAlternateCodeAttempt(error, errorCode);

        this.logger.warn(
          `OAuth token exchange failed attempt=${index + 1}/${codes.length} source=${attemptSource} durationMs=${Date.now() - attemptStartedAt} status=${status ?? "unknown"} oauthError=${errorCode ?? "unknown"} networkCode=${networkCode ?? "unknown"} retry=${shouldRetry}`,
        );

        if (shouldRetry) {
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

    await this.rlsContext.runWithIsolatedTenantContext(
      tenantId,
      mid,
      async () => {
        await this.credRepo.upsert({
          tenantId,
          userId,
          mid,
          accessToken: creds.accessToken,
          refreshToken: creds.refreshToken,
          expiresAt: new Date(0),
          updatedAt: new Date(),
        });
      },
    );
  }

  async saveTokens(
    tenantId: string,
    userId: string,
    mid: string,
    tokenData: MceTokenResponse,
  ) {
    const saveStartedAt = Date.now();
    this.logger.log(
      `saveTokens start tenantId=${tenantId} userId=${userId} mid=${mid}`,
    );

    const encryptAccessStartedAt = Date.now();
    const encryptedAccessToken = this.encryptionService.encrypt(
      tokenData.access_token,
    ) as string;
    this.logger.log(
      `saveTokens access token encrypted durationMs=${Date.now() - encryptAccessStartedAt}`,
    );

    const encryptRefreshStartedAt = Date.now();
    const encryptedRefreshToken = this.encryptionService.encrypt(
      tokenData.refresh_token,
    ) as string;
    this.logger.log(
      `saveTokens refresh token encrypted durationMs=${Date.now() - encryptRefreshStartedAt}`,
    );

    const rlsStartedAt = Date.now();
    this.logger.log("saveTokens entering runWithIsolatedTenantContext");
    await this.rlsContext.runWithIsolatedTenantContext(
      tenantId,
      mid,
      async () => {
        const upsertStartedAt = Date.now();
        this.logger.log("saveTokens credentials upsert starting");
        await this.credRepo.upsert({
          tenantId,
          userId,
          mid,
          accessToken: encryptedAccessToken,
          refreshToken: encryptedRefreshToken,
          expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
          updatedAt: new Date(),
        });
        this.logger.log(
          `saveTokens credentials upsert completed durationMs=${Date.now() - upsertStartedAt}`,
        );
      },
    );
    this.logger.log(
      `saveTokens runWithIsolatedTenantContext completed durationMs=${Date.now() - rlsStartedAt}`,
    );
    this.logger.log(
      `saveTokens completed totalDurationMs=${Date.now() - saveStartedAt}`,
    );
  }

  async getUserInfo(tssd: string, accessToken: string) {
    const url = `https://${tssd}.auth.marketingcloudapis.com/v2/userinfo`;
    const startedAt = Date.now();
    this.logger.log(`OAuth userinfo request starting tssd=${tssd}`);

    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: MCE_HTTP_TIMEOUT_MS,
      });
      this.logger.log(
        `OAuth userinfo request succeeded durationMs=${Date.now() - startedAt}`,
      );
      return response.data;
    } catch (error) {
      const status = this.getAxiosStatus(error);
      const networkCode = this.getAxiosNetworkCode(error);
      this.logger.warn(
        `OAuth userinfo request failed durationMs=${Date.now() - startedAt} status=${status ?? "unknown"} networkCode=${networkCode ?? "unknown"}`,
      );
      throw error;
    }
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
    const callbackStartedAt = Date.now();
    const embedded = this.extractAuthCode(code);
    const embeddedEid = embedded?.eid;
    const embeddedCode = embedded?.authCode;
    const codeSegments = code.split(".").length;
    this.logger.log(
      `OAuth callback pipeline start tssd=${tssd} codeLen=${code.length} codeSegments=${codeSegments} hasEmbeddedAuthCode=${Boolean(embeddedCode)} hasProvidedSfUserId=${Boolean(sfUserId)} hasProvidedEid=${Boolean(eid)} hasProvidedMid=${Boolean(mid)}`,
    );

    const tokenData = await this.exchangeCodeForToken(
      tssd,
      code,
      embeddedCode,
      mid,
    );
    this.logger.log("OAuth callback token exchange step complete");

    const info = await this.getUserInfo(tssd, tokenData.access_token);
    this.logger.log("OAuth callback userinfo step complete");

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
      this.logger.warn("OAuth callback identity mismatch detected: sfUserId");
      throw new AppError(ErrorCode.AUTH_IDENTITY_MISMATCH);
    }
    if (providedEid && derivedEid && providedEid !== derivedEid) {
      this.logger.warn("OAuth callback identity mismatch detected: eid");
      throw new AppError(ErrorCode.AUTH_IDENTITY_MISMATCH);
    }
    if (providedMid && derivedMid && providedMid !== derivedMid) {
      this.logger.warn("OAuth callback identity mismatch detected: mid");
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

    const tenantUpsertStartedAt = Date.now();
    this.logger.log("OAuth callback tenant upsert starting");
    const tenant = await this.tenantRepo.upsert({ eid: effectiveEid, tssd });
    this.logger.log(
      `OAuth callback tenant upsert completed durationMs=${Date.now() - tenantUpsertStartedAt}`,
    );

    // sfUserId is a Salesforce User ID (18-char format), which is globally unique
    // across all MCE enterprises. A user belongs to exactly one MCE enterprise,
    // so we check globally rather than per-tenant.
    const userLookupStartedAt = Date.now();
    this.logger.log("OAuth callback user lookup starting");
    const existingUser = await this.userRepo.findBySfUserId(effectiveSfUserId);
    this.logger.log(
      `OAuth callback user lookup completed durationMs=${Date.now() - userLookupStartedAt} found=${Boolean(existingUser)}`,
    );

    if (!existingUser) {
      const seatLimitStartedAt = Date.now();
      this.logger.log("OAuth callback seat limit check starting");
      await this.seatLimitService.checkSeatLimit(tenant.id);
      this.logger.log(
        `OAuth callback seat limit check completed durationMs=${Date.now() - seatLimitStartedAt}`,
      );
    }

    const userUpsertStartedAt = Date.now();
    this.logger.log("OAuth callback user upsert starting");
    const user = await this.userRepo.upsert({
      sfUserId: effectiveSfUserId,
      tenantId: tenant.id,
      email: effectiveEmail,
      name: effectiveName,
    });
    this.logger.log(
      `OAuth callback user upsert completed durationMs=${Date.now() - userUpsertStartedAt}`,
    );

    const saveTokensStartedAt = Date.now();
    this.logger.log(
      `OAuth callback token persistence starting tenantId=${tenant.id} mid=${effectiveMid}`,
    );
    await this.saveTokens(tenant.id, user.id, effectiveMid, tokenData);
    this.logger.log(
      `OAuth callback token persistence completed durationMs=${Date.now() - saveTokensStartedAt}`,
    );
    this.logger.log(
      `OAuth callback pipeline complete durationMs=${Date.now() - callbackStartedAt}`,
    );

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

  private buildCodeExchangeAttempts(
    code: string,
    embeddedCode?: string,
  ): string[] {
    if (!embeddedCode || embeddedCode === code) {
      return [code];
    }

    // Prefer embedded auth_code from wrapped code payloads used by MCE iframe flow.
    return [embeddedCode, code];
  }

  private shouldTryAlternateCodeAttempt(
    error: unknown,
    errorCode?: string,
  ): boolean {
    if (errorCode === "invalid_token" || errorCode === "invalid_grant") {
      return true;
    }

    if (!axios.isAxiosError(error)) {
      return false;
    }

    if (error.code === "ECONNABORTED" || error.code === "ETIMEDOUT") {
      return true;
    }

    return !error.response;
  }

  private getAxiosStatus(error: unknown): number | undefined {
    if (!axios.isAxiosError(error)) {
      return undefined;
    }
    return error.response?.status;
  }

  private getAxiosNetworkCode(error: unknown): string | undefined {
    if (!axios.isAxiosError(error)) {
      return undefined;
    }
    return error.code;
  }

  private logTokenError(message: string, error: unknown) {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const redacted =
        data && typeof data === "object" ? safeContext(data) : undefined;
      this.logger.error(
        `${message} (${status ?? "unknown status"})`,
        redacted ? JSON.stringify(redacted) : undefined,
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
    const creds = await this.rlsContext.runWithTenantContext(
      tenantId,
      mid,
      () => this.credRepo.findByUserTenantMid(userId, tenantId, mid),
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
      const decryptedAccessToken = this.encryptionService.decrypt(
        creds.accessToken,
      ) as string;
      return {
        accessToken: decryptedAccessToken,
        tssd: tenant.tssd,
        didRefresh: false,
      };
    }

    const decryptedRefreshToken = this.encryptionService.decrypt(
      creds.refreshToken,
    ) as string;
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
        timeout: MCE_HTTP_TIMEOUT_MS,
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
