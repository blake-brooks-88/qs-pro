import { Inject, Injectable, Logger } from '@nestjs/common';
import type { IUserRepository } from '@qpp/database';

@Injectable()
export class LastActiveService {
  private readonly logger = new Logger(LastActiveService.name);
  private readonly lastActiveCache = new Map<string, number>();
  private static readonly LAST_ACTIVE_DEBOUNCE_MS = 5 * 60 * 1000;

  constructor(
    @Inject('USER_REPOSITORY') private readonly userRepo: IUserRepository,
  ) {}

  async touchLastActive(userId: string): Promise<void> {
    const now = Date.now();
    const lastTouch = this.lastActiveCache.get(userId);

    if (
      typeof lastTouch === 'number' &&
      now - lastTouch < LastActiveService.LAST_ACTIVE_DEBOUNCE_MS
    ) {
      return;
    }

    this.lastActiveCache.set(userId, now);

    try {
      await this.userRepo.updateLastActiveAt(userId);
    } catch (error) {
      this.logger.warn(
        `Failed to update lastActiveAt for user=${userId}`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
