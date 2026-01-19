import { ForbiddenException } from "@nestjs/common";

export class SeatLimitExceededException extends ForbiddenException {
  constructor() {
    super({
      message: "Your organization has reached its seat limit",
      errorCode: "SEAT_LIMIT_EXCEEDED",
    });
  }
}
