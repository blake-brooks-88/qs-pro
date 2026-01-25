import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";

import { AppError, ErrorCode } from "../common/errors";
import { AuthService } from "./auth.service";

describe("AuthService.verifyMceJwt", () => {
  it("throws CONFIG_ERROR when MCE_JWT_SIGNING_SECRET is not configured", async () => {
    const configService = {
      get: vi.fn(() => undefined),
    } satisfies Pick<ConfigService, "get">;

    const service = new AuthService(
      configService as unknown as ConfigService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.verifyMceJwt("any.jwt.value")).rejects.toBeInstanceOf(
      AppError,
    );
    await expect(service.verifyMceJwt("any.jwt.value")).rejects.toMatchObject({
      code: ErrorCode.CONFIG_ERROR,
      context: { reason: "MCE_JWT_SIGNING_SECRET not configured" },
    });
  });
});
