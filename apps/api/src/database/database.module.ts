import { Module, Global, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from '@qs-pro/database';

@Global()
@Module({
  providers: [
    {
      provide: 'DATABASE',
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('DatabaseModule');
        const dbUrl =
          configService.get<string>('DATABASE_URL') ||
          'postgres://postgres:password@127.0.0.1:5432/qs_pro';
        
        logger.log(`Connecting to database at ${dbUrl.replace(/:[^:]+@/, ':****@')}`);
        return createDatabase(dbUrl);
      },
      inject: [ConfigService],
    },
  ],
  exports: ['DATABASE'],
})
export class DatabaseModule {}
