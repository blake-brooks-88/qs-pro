import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import {
  type HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { Queue } from "bullmq";

@Injectable()
export class RedisHealthIndicator {
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
            () => reject(new Error("Redis client access timeout")),
            500,
          ),
        ),
      ]);

      const response = await Promise.race([
        client.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Redis ping timeout")), 500),
        ),
      ]);

      if (response === "PONG") {
        return indicator.up();
      }
      return indicator.down({
        message:
          process.env.NODE_ENV === "production"
            ? "Unhealthy"
            : `Unexpected response: ${String(response)}`,
      });
    } catch (error) {
      return indicator.down({
        message:
          process.env.NODE_ENV === "production"
            ? "Unhealthy"
            : error instanceof Error
              ? error.message
              : "Unknown error",
      });
    }
  }
}
