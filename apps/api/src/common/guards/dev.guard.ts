import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DevGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new ForbiddenException('Dev tools are not available in production');
    }
    return true;
  }
}
