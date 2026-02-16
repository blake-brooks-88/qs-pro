import { describe, expect, it, vi } from "vitest";

import { HealthController } from "../health.controller";

function createMockIndicator(key: string, status: "up" | "down" = "up") {
  return {
    isHealthy: vi.fn().mockResolvedValue({ [key]: { status } }),
  };
}

function createMockHealthCheckService() {
  return {
    check: vi
      .fn()
      .mockImplementation(async (indicators: Array<() => Promise<unknown>>) => {
        const details: Record<string, unknown> = {};
        for (const indicator of indicators) {
          const result = await indicator();
          Object.assign(details, result);
        }
        const allUp = Object.values(details).every(
          (v) => (v as { status: string }).status === "up",
        );
        return {
          status: allUp ? "ok" : "error",
          details,
        };
      }),
  };
}

describe("HealthController", () => {
  describe("livez()", () => {
    it("returns ok status with empty checks", async () => {
      const mockHealth = createMockHealthCheckService();
      const controller = new HealthController(
        mockHealth as never,
        createMockIndicator("postgres") as never,
        createMockIndicator("redis") as never,
        createMockIndicator("bullmq") as never,
      );

      const result = await controller.livez();

      expect(result).toEqual({ status: "ok", details: {} });
      expect(mockHealth.check).toHaveBeenCalledWith([]);
    });
  });

  describe("readyz()", () => {
    it("calls all three health indicators", async () => {
      const mockHealth = createMockHealthCheckService();
      const mockPostgres = createMockIndicator("postgres");
      const mockRedis = createMockIndicator("redis");
      const mockBullmq = createMockIndicator("bullmq");

      const controller = new HealthController(
        mockHealth as never,
        mockPostgres as never,
        mockRedis as never,
        mockBullmq as never,
      );

      const result = await controller.readyz();

      expect(mockPostgres.isHealthy).toHaveBeenCalledWith("postgres");
      expect(mockRedis.isHealthy).toHaveBeenCalledWith("redis");
      expect(mockBullmq.isHealthy).toHaveBeenCalledWith("bullmq");
      expect(result.status).toBe("ok");
    });

    it("returns error status when any indicator is down", async () => {
      const mockHealth = createMockHealthCheckService();
      const mockPostgres = createMockIndicator("postgres");
      const mockRedis = createMockIndicator("redis", "down");
      const mockBullmq = createMockIndicator("bullmq");

      const controller = new HealthController(
        mockHealth as never,
        mockPostgres as never,
        mockRedis as never,
        mockBullmq as never,
      );

      const result = await controller.readyz();

      expect(result.status).toBe("error");
    });

    it("includes all indicator details in response", async () => {
      const mockHealth = createMockHealthCheckService();
      const controller = new HealthController(
        mockHealth as never,
        createMockIndicator("postgres") as never,
        createMockIndicator("redis") as never,
        createMockIndicator("bullmq") as never,
      );

      const result = await controller.readyz();

      expect(result.details).toEqual({
        postgres: { status: "up" },
        redis: { status: "up" },
        bullmq: { status: "up" },
      });
    });
  });
});
