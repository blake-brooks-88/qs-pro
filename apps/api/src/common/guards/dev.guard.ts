import { CanActivate, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DevGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(): boolean {
    if (this.configService.get<string>('NODE_ENV') !== 'development') {
      throw new ForbiddenException(
        'Dev tools are only available in development',
      );
    }
    return true;
  }
}
