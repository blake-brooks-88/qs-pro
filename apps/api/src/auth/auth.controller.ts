import { Controller, Get, Post, Body, Query, Req, UnauthorizedException, Res, Redirect } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Post('login')
  async loginPost(@Body('jwt') jwt: string, @Req() req: any, @Res() res: any) {
    if (!jwt) {
      throw new UnauthorizedException('JWT is required');
    }

    try {
      const { user, tenant } = await this.authService.handleJwtLogin(jwt);

      // Establish secure HTTP-only session
      if (req.session) {
        req.session.set('userId', user.id);
        req.session.set('tenantId', tenant.id);
      }

      // Redirect to frontend (root)
      return res.redirect(302, '/');
    } catch (error) {
      console.error('[Auth Error] JWT Login failure:', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  @Get('me')
  async me(@Req() req: any) {
    if (!req.session) {
      throw new UnauthorizedException('Session not available');
    }

    const userId = req.session.get('userId');
    const tenantId = req.session.get('tenantId');

    if (!userId || !tenantId) {
      throw new UnauthorizedException('Not authenticated');
    }

    const user = await this.authService.findUserById(userId);
    const tenant = await this.authService.findTenantById(tenantId);

    if (!user || !tenant) {
      throw new UnauthorizedException('User or Tenant not found');
    }

    return { user, tenant };
  }

  @Get('login')
  @Redirect()
  async login(@Query('tssd') tssd: string) {
    console.log(`[Auth] GET login hit with TSSD: ${tssd}`);
    try {
      if (!tssd) {
        throw new UnauthorizedException('TSSD is required for login');
      }
      const url = this.authService.getAuthUrl(tssd);
      console.log(`[Auth] Redirecting to: ${url}`);
      return { url, statusCode: 302 };
    } catch (error) {
      console.error('[Auth Error] Login failure:', error);
      throw error;
    }
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('tssd') tssd: string,
    @Query('state') state: string,
    @Query('sf_user_id') sfUserId?: string, 
    @Query('eid') eid?: string,
  ) {
    const effectiveTssd = tssd || state;
    
    if (!code || !effectiveTssd) {
      throw new UnauthorizedException('Missing code or TSSD in callback');
    }

    const result = await this.authService.handleCallback(
      effectiveTssd, 
      code, 
      sfUserId, 
      eid
    );
    
    return result;
  }

  @Get('refresh')
  async refresh(@Query('tenantId') tenantId: string, @Query('userId') userId: string) {
    if (!tenantId || !userId) {
      throw new UnauthorizedException('Tenant ID and User ID are required');
    }
    const { accessToken } = await this.authService.refreshToken(tenantId, userId);
    return { access_token: accessToken };
  }
}