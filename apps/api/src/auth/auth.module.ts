import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SfmcStrategy } from './sfmc.strategy';
import { DatabaseModule } from '../database/database.module';
import { 
  DrizzleTenantRepository, 
  DrizzleUserRepository, 
  DrizzleCredentialsRepository 
} from '@qs-pro/database';

@Module({
  imports: [PassportModule, DatabaseModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    SfmcStrategy,
    {
      provide: 'TENANT_REPOSITORY',
      useFactory: (db: any) => new DrizzleTenantRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'USER_REPOSITORY',
      useFactory: (db: any) => new DrizzleUserRepository(db),
      inject: ['DATABASE'],
    },
    {
      provide: 'CREDENTIALS_REPOSITORY',
      useFactory: (db: any) => new DrizzleCredentialsRepository(db),
      inject: ['DATABASE'],
    },
  ],
  exports: [AuthService],
})
export class AuthModule {}
