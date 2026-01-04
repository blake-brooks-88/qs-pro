import { Controller, Get, Query, Req, UnauthorizedException, Res, Redirect } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {}

  @Get('login')
  @Redirect()
  async login(@Query('tssd') tssd: string) {
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