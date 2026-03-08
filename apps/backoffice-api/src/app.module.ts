import path from 'node:path';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from '@qpp/backend-shared';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env'),
        path.resolve(__dirname, '..', '..', '..', '.env'),
      ],
    }),
    LoggerModule,
  ],
})
export class AppModule {}
