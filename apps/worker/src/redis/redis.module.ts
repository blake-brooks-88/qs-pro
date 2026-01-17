import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";

function createNoopRedisClient() {
  return {
    publish: async () => 0,
    set: async () => "OK",
    get: async () => null,
    incr: async () => 0,
    decr: async () => 0,
    expire: async () => 0,
    duplicate: () => ({
      subscribe: async () => undefined,
      quit: async () => undefined,
      on: () => undefined,
      off: () => undefined,
    }),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: "REDIS_CLIENT",
      useFactory: (configService: ConfigService) => {
        if (process.env.NODE_ENV === "test") {
          return createNoopRedisClient();
        }

        return new Redis(
          configService.get<string>("REDIS_URL", "redis://localhost:6379"),
          { maxRetriesPerRequest: null },
        );
      },
      inject: [ConfigService],
    },
  ],
  exports: ["REDIS_CLIENT"],
})
export class RedisModule {}
