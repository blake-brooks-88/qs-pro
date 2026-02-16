import { Injectable } from "@nestjs/common";
import { InjectQueue } from "@nestjs/bullmq";
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { Queue } from "bullmq";

@Injectable()
export class BullMQHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @InjectQueue("shell-query") private readonly shellQueryQueue: Queue,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const client = await Promise.race([
        this.shellQueryQueue.client,
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("BullMQ client access timeout")),
            500,
          ),
        ),
      ]);

      if ((client as { status?: string }).status === "ready") {
        return indicator.up();
      }
      return indicator.down({
        message: `BullMQ client status: ${String((client as { status?: string }).status)}`,
      });
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}
