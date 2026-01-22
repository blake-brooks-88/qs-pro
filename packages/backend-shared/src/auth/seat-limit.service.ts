import { Inject, Injectable } from "@nestjs/common";
import type { ITenantRepository } from "@qpp/database";

import { AppError, ErrorCode } from "../common/errors";

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
      throw new AppError(ErrorCode.SEAT_LIMIT_EXCEEDED);
    }
  }
}
