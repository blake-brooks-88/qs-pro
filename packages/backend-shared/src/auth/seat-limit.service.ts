import { Inject, Injectable } from "@nestjs/common";
import type {
  IOrgSubscriptionRepository,
  ITenantRepository,
} from "@qpp/database";

import { AppError, ErrorCode } from "../common/errors";

@Injectable()
export class SeatLimitService {
  constructor(
    @Inject("TENANT_REPOSITORY")
    private tenantRepo: ITenantRepository,
    @Inject("ORG_SUBSCRIPTION_REPOSITORY")
    private orgSubscriptionRepo: IOrgSubscriptionRepository,
  ) {}

  async checkSeatLimit(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      return;
    }

    const subscription =
      await this.orgSubscriptionRepo.findByTenantId(tenantId);
    if (!subscription || subscription.seatLimit === null) {
      return;
    }

    const currentUserCount =
      await this.tenantRepo.countUsersByTenantId(tenantId);

    if (currentUserCount >= subscription.seatLimit) {
      throw new AppError(ErrorCode.SEAT_LIMIT_EXCEEDED);
    }
  }
}
