import { Test, TestingModule } from "@nestjs/testing";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";

import { MetricsController } from "../metrics.controller";

vi.mock("prom-client", () => ({
  register: {
    contentType: "text/plain; version=0.0.4; charset=utf-8",
    metrics: vi.fn(),
  },
}));

import { register } from "prom-client";

interface MockFastifyReply {
  header: Mock;
  send: Mock;
}

function createMockReply(): MockFastifyReply {
  return {
    header: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
}

describe("MetricsController", () => {
  let controller: MetricsController;
  let mockReply: MockFastifyReply;

  async function createTestModule(): Promise<TestingModule> {
    return Test.createTestingModule({
      controllers: [MetricsController],
    }).compile();
  }

  beforeEach(async () => {
    vi.clearAllMocks();
    mockReply = createMockReply();
    const module = await createTestModule();
    controller = module.get<MetricsController>(MetricsController);
  });

  describe("getMetrics()", () => {
    it("sets Content-Type header to Prometheus format", async () => {
      // Arrange
      const metricsOutput = "# HELP test_metric Test\ntest_metric 1";
      vi.mocked(register.metrics).mockResolvedValue(metricsOutput);

      // Act
      await controller.getMetrics(mockReply as never);

      // Assert
      expect(mockReply.header).toHaveBeenCalledWith(
        "Content-Type",
        "text/plain; version=0.0.4; charset=utf-8",
      );
    });

    it("sends metrics buffer as response body", async () => {
      // Arrange
      const metricsOutput =
        "# HELP process_cpu_seconds Total CPU time\nprocess_cpu_seconds 0.5";
      vi.mocked(register.metrics).mockResolvedValue(metricsOutput);

      // Act
      await controller.getMetrics(mockReply as never);

      // Assert
      expect(mockReply.send).toHaveBeenCalledWith(metricsOutput);
    });
  });
});
