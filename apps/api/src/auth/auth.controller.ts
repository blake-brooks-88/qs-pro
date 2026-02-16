import {
  Body,
  Controller,
  Get,
  InternalServerErrorException,
  Logger,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthService, SessionGuard } from '@qpp/backend-shared';
import { randomBytes } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

import { AuditService } from '../audit/audit.service';
import type { UserSession } from '../common/decorators/current-user.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

type SecureSession = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(): void;
};

type SessionRequest = FastifyRequest & { session?: SecureSession };

interface LoginPostBody {
  jwt: string;
}

interface OAuthStatePayload {
  tssd: string;
  nonce: string;
}

const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

@SkipThrottle()
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  // TODO(Phase 12): auth.session_expired — requires SessionGuard DI wiring in @qpp/backend-shared
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
    private readonly auditService: AuditService,
  ) {}

  private clearAuthSession(session: SecureSession | undefined): void {
    if (!session) {
      return;
    }
    session.set('userId', undefined);
    session.set('tenantId', undefined);
    session.set('mid', undefined);
    session.set('csrfToken', undefined);
    this.clearOAuthState(session);
  }

  private ensureCsrfToken(session: SecureSession): string {
    const existing = session.get('csrfToken');
    if (typeof existing === 'string' && existing) {
      return existing;
    }

    const token = randomBytes(32).toString('base64url');
    session.set('csrfToken', token);
    return token;
  }

  private clearOAuthState(session: SecureSession): void {
    session.set('oauth_state_nonce', undefined);
    session.set('oauth_state_tssd', undefined);
    session.set('oauth_state_created_at', undefined);
  }

  @Post('login')
  @Redirect()
  async loginPost(
    @Body() body: LoginPostBody,
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const jwt = this.extractJwt(body);

    if (!jwt) {
      throw new UnauthorizedException('JWT is required');
    }

    if (!req.session) {
      throw new InternalServerErrorException('Session not available');
    }

    this.logger.log(
      `MCE SSO login request content-type=${String(req.headers['content-type'] ?? '')} origin=${String(req.headers.origin ?? '')}`,
    );

    try {
      const { user, tenant, mid } = await this.authService.handleJwtLogin(jwt);

      this.ensureCsrfToken(req.session);
      req.session.set('userId', user.id);
      req.session.set('tenantId', tenant.id);
      req.session.set('mid', mid);

      void this.auditService.log({
        eventType: 'auth.login',
        actorType: 'user',
        actorId: user.id,
        tenantId: tenant.id,
        mid,
        targetId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      const accept = String(req.headers.accept ?? '');
      const requestedJson = accept.includes('application/json');

      if (requestedJson) {
        // Override redirect behavior for JSON responses
        res.status(200).send({ ok: true });
        return;
      }

      return { url: '/', statusCode: 302 };
    } catch (error) {
      this.logger.error(
        'JWT Login failure',
        error instanceof Error ? error.stack : error,
      );
      throw new UnauthorizedException('Authentication failed');
    }
  }

  @Get('me')
  @UseGuards(SessionGuard)
  async me(
    @CurrentUser() userSession: UserSession,
    @Req() req: SessionRequest,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const user = await this.authService.findUserById(userSession.userId);
    const tenant = await this.authService.findTenantById(userSession.tenantId);

    if (!user || !tenant) {
      req.session?.delete();
      throw new UnauthorizedException('Not authenticated');
    }

    try {
      await this.authService.refreshToken(tenant.id, user.id, userSession.mid);
    } catch (error) {
      req.session?.delete();
      res.status(401);
      return {
        reason: 'reauth_required',
        message:
          error instanceof Error
            ? error.message
            : 'Authentication failed; please re-authenticate.',
      };
    }

    const csrfToken = req.session ? this.ensureCsrfToken(req.session) : null;
    return { user, tenant, csrfToken };
  }

  @Get('login')
  @Redirect()
  async login(
    @Query('tssd') tssd: string | undefined,
    @Query('jwt') jwtFromQuery: string | undefined,
    @Req() req: SessionRequest,
  ) {
    const referer = String(req.headers.referer ?? '');
    const headerValue = (
      req.headers as unknown as { 'sec-fetch-dest'?: unknown }
    )['sec-fetch-dest'];
    const secFetchDest = (
      typeof headerValue === 'string' ? headerValue : ''
    ).toLowerCase();
    const isMceReferer =
      referer.includes('mc.exacttarget.com') ||
      referer.includes('.exacttarget.com') ||
      referer.includes('.marketingcloudapps.com');
    const isIframeNavigation = secFetchDest === 'iframe';
    const isMceEmbed = isMceReferer || isIframeNavigation;

    const jwt = this.extractJwt(jwtFromQuery);

    const session = req.session;
    const userId = session?.get('userId');
    const tenantId = session?.get('tenantId');
    const mid = session?.get('mid');
    const resolvedTssd = this.resolveAuthTssd(tssd);

    try {
      // If we have a legacy/partial session (missing MID), clear it so we don't loop on `/api/auth/me`.
      if (
        session &&
        typeof userId === 'string' &&
        typeof tenantId === 'string' &&
        typeof mid !== 'string'
      ) {
        this.clearAuthSession(session);
      }

      if (!session) {
        throw new InternalServerErrorException('Session not available');
      }

      if (
        typeof userId === 'string' &&
        typeof tenantId === 'string' &&
        typeof mid === 'string'
      ) {
        const [existingUser, existingTenant] = await Promise.all([
          this.authService.findUserById(userId),
          this.authService.findTenantById(tenantId),
        ]);

        if (existingUser && existingTenant) {
          return { url: '/', statusCode: 302 };
        }

        this.clearAuthSession(session);
      }

      if (jwt) {
        const {
          user,
          tenant,
          mid: resolvedMid,
        } = await this.authService.handleJwtLogin(jwt);
        session.set('userId', user.id);
        session.set('tenantId', tenant.id);
        session.set('mid', resolvedMid);

        void this.auditService.log({
          eventType: 'auth.login',
          actorType: 'user',
          actorId: user.id,
          tenantId: tenant.id,
          mid: resolvedMid,
          targetId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        });

        return { url: '/', statusCode: 302 };
      }

      if (!resolvedTssd) {
        if (isMceEmbed) {
          return { url: '/', statusCode: 302 };
        }
        throw new UnauthorizedException(
          'TSSD is required for login. Set MCE_TSSD.',
        );
      }

      const nonce = randomBytes(16).toString('base64url');
      this.ensureCsrfToken(session);
      const state = this.encodeOAuthState({ tssd: resolvedTssd, nonce });
      session.set('oauth_state_nonce', nonce);
      session.set('oauth_state_tssd', resolvedTssd);
      session.set('oauth_state_created_at', String(Date.now()));

      const url = this.authService.getAuthUrl(resolvedTssd, state);
      return { url, statusCode: 302 };
    } catch (error) {
      this.logger.error(
        'Login failure',
        error instanceof Error ? error.stack : error,
      );
      throw error;
    }
  }

  @Get('callback')
  @Redirect()
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Req() req: SessionRequest,
    @Query('sf_user_id') sfUserId?: string,
    @Query('eid') eid?: string,
    @Query('mid') mid?: string,
  ) {
    const callbackStartedAt = Date.now();

    if (!req.session) {
      throw new InternalServerErrorException('Session not available');
    }

    if (!code || !state) {
      throw new UnauthorizedException('Missing code or state in callback');
    }

    const codeSegments = code.split('.').length;
    const hasSessionNonce =
      typeof req.session.get('oauth_state_nonce') === 'string';
    const hasSessionTssd =
      typeof req.session.get('oauth_state_tssd') === 'string';
    const hasSessionCreatedAt =
      typeof req.session.get('oauth_state_created_at') === 'string';
    this.logger.log(
      `OAuth callback received codeLen=${code.length} codeSegments=${codeSegments} stateLen=${state.length} hasSessionState=${hasSessionNonce && hasSessionTssd && hasSessionCreatedAt} hasSfUserId=${Boolean(
        sfUserId,
      )} hasEid=${Boolean(eid)} hasMid=${Boolean(mid)}`,
    );

    const validateStateStartedAt = Date.now();
    const effectiveTssd = this.validateOAuthState(state, req.session);
    this.logger.log(
      `OAuth callback state validated tssd=${effectiveTssd} durationMs=${Date.now() - validateStateStartedAt}`,
    );
    this.logger.log('OAuth callback state consumed');

    const authServiceStartedAt = Date.now();
    const result = await this.authService.handleCallback(
      effectiveTssd,
      code,
      sfUserId,
      eid,
      undefined,
      undefined,
      mid,
    );
    this.logger.log(
      `OAuth callback AuthService completed durationMs=${Date.now() - authServiceStartedAt}`,
    );

    this.ensureCsrfToken(req.session);
    req.session.set('userId', result.user.id);
    req.session.set('tenantId', result.tenant.id);
    req.session.set('mid', result.mid);

    void this.auditService.log({
      eventType: 'auth.login',
      actorType: 'user',
      actorId: result.user.id,
      tenantId: result.tenant.id,
      mid: result.mid,
      targetId: result.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    this.logger.log(
      `OAuth callback completed durationMs=${Date.now() - callbackStartedAt}`,
    );
    return { url: '/', statusCode: 302 };
  }

  @Get('refresh')
  @UseGuards(SessionGuard)
  async refresh(
    @CurrentUser() userSession: UserSession,
    @Req() req: SessionRequest,
  ) {
    await this.authService.refreshToken(
      userSession.tenantId,
      userSession.userId,
      userSession.mid,
    );

    void this.auditService.log({
      eventType: 'auth.oauth_refreshed',
      actorType: 'user',
      actorId: userSession.userId,
      tenantId: userSession.tenantId,
      mid: userSession.mid,
      targetId: userSession.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return { ok: true };
  }

  @Get('logout')
  logout(@Req() req: SessionRequest) {
    const tenantId = req.session?.get('tenantId');
    const mid = req.session?.get('mid');
    const userId = req.session?.get('userId');

    if (
      typeof tenantId === 'string' &&
      typeof mid === 'string' &&
      typeof userId === 'string'
    ) {
      void this.auditService.log({
        eventType: 'auth.logout',
        actorType: 'user',
        actorId: userId,
        tenantId,
        mid,
        targetId: userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });
    }

    req.session?.delete();
    return { ok: true };
  }

  private resolveAuthTssd(explicitTssd?: string): string | undefined {
    if (explicitTssd) {
      return this.normalizeTssd(explicitTssd);
    }

    const configuredTssd = this.configService.get<string>('MCE_TSSD');
    if (configuredTssd) {
      return this.normalizeTssd(configuredTssd);
    }
    return undefined;
  }

  private normalizeTssd(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new UnauthorizedException('TSSD is required');
    }

    if (!/^[a-z0-9-]+$/i.test(trimmed)) {
      throw new UnauthorizedException('Invalid TSSD format');
    }

    return trimmed.toLowerCase();
  }

  private encodeOAuthState(payload: OAuthStatePayload): string {
    return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  }

  private validateOAuthState(state: string, session: SecureSession): string {
    const expectedNonce = session.get('oauth_state_nonce');
    const expectedTssd = session.get('oauth_state_tssd');
    const createdAt = session.get('oauth_state_created_at');
    this.clearOAuthState(session);

    if (
      typeof expectedNonce !== 'string' ||
      typeof expectedTssd !== 'string' ||
      typeof createdAt !== 'string'
    ) {
      this.logger.warn('OAuth callback rejected: session state missing');
      throw new UnauthorizedException('OAuth state not initialized');
    }

    const statePayload = this.decodeOAuthState(state);
    if (!statePayload) {
      this.logger.warn('OAuth callback rejected: state payload invalid');
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const createdAtMs = Number(createdAt);
    if (!Number.isFinite(createdAtMs)) {
      this.logger.warn(
        'OAuth callback rejected: session state timestamp is invalid',
      );
      throw new UnauthorizedException('OAuth state not initialized');
    }
    if (Date.now() - createdAtMs > OAUTH_STATE_MAX_AGE_MS) {
      this.logger.warn(
        `OAuth callback rejected: session state expired ageMs=${Date.now() - createdAtMs}`,
      );
      throw new UnauthorizedException('OAuth state expired');
    }

    if (
      statePayload.nonce !== expectedNonce ||
      statePayload.tssd !== expectedTssd
    ) {
      this.logger.warn(
        'OAuth callback rejected: session state nonce/tssd mismatch',
      );
      throw new UnauthorizedException('OAuth state mismatch');
    }

    return statePayload.tssd;
  }

  private decodeOAuthState(state: string): OAuthStatePayload | undefined {
    try {
      const json = Buffer.from(state, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const tssd =
        typeof parsed.tssd === 'string'
          ? this.normalizeTssd(parsed.tssd)
          : undefined;
      const nonce = typeof parsed.nonce === 'string' ? parsed.nonce : undefined;
      if (!tssd || !nonce) {
        return undefined;
      }
      return { tssd, nonce };
    } catch {
      return undefined;
    }
  }

  private extractJwt(body: unknown): string {
    if (typeof body === 'string') {
      return body.trim();
    }
    if (!body || typeof body !== 'object') {
      return '';
    }

    const record = body as Record<string, unknown>;
    const candidate =
      record.jwt ??
      record.JWT ??
      record.token ??
      record.access_token ??
      record.accessToken;

    return typeof candidate === 'string' ? candidate.trim() : '';
  }
}
