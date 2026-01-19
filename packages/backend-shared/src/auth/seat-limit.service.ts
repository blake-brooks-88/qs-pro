import { Inject, Injectable } from "@nestjs/common";
import type { ITenantRepository } from "@qs-pro/database";

import { SeatLimitExceededException } from "../common/exceptions/seat-limit-exceeded.exception";

@Injectable()
export class SeatLimitService {
  constructor(
    @Inject("TENANT_REPOSITORY")
    private tenantRepo: ITenantRepository,
  ) {}

  async checkSeatLimit(tenantId: string): Promise<void> {
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      return;
    }

    if (tenant.seatLimit === null) {
      return;
    }

    const currentUserCount =
      await this.tenantRepo.countUsersByTenantId(tenantId);

    if (currentUserCount >= tenant.seatLimit) {
      throw new SeatLimitExceededException();
    }
  }
}
