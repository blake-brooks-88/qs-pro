import { Module } from '@nestjs/common';
import { DatabaseModule } from '@qpp/backend-shared';

import { CsrfGuard } from '../auth/csrf.guard';
import { DrizzleFoldersRepository } from './drizzle-folders.repository';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

@Module({
  imports: [DatabaseModule],
  controllers: [FoldersController],
  providers: [
    FoldersService,
    CsrfGuard,
    {
      provide: 'FOLDERS_REPOSITORY',
      useFactory: (db: unknown) => new DrizzleFoldersRepository(db as never),
      inject: ['DATABASE'],
    },
  ],
  exports: [FoldersService, 'FOLDERS_REPOSITORY'],
})
export class FoldersModule {}
