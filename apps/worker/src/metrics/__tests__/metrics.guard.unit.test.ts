import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { beforeEach, describe, expect, it } from "vitest";

import { MetricsGuard } from "../metrics.guard";

function createMockContext(
  headers: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
      getResponse: () => ({}),
      getNext: () => ({}),
    }),
    getClass: () => Object,
    getHandler: () => Object,
    getArgs: () => [],
    getArgByIndex: () => ({}),
    switchToRpc: () => ({}) as never,
    switchToWs: () => ({}) as never,
    getType: () => "http",
  } as unknown as ExecutionContext;
}

describe("MetricsGuard", () => {
  let guard: MetricsGuard;
  let configValues: Record<string, string | undefined>;

  beforeEach(async () => {
    configValues = {};
    const module = await Test.createTestingModule({
      providers: [
        MetricsGuard,
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
      ],
    }).compile();

    guard = module.get<MetricsGuard>(MetricsGuard);
  });

  it("allows access when METRICS_API_KEY is not configured", () => {
    configValues.METRICS_API_KEY = undefined;

    expect(guard.canActivate(createMockContext())).toBe(true);
  });

  it("denies access when METRICS_API_KEY is set but no Authorization header", () => {
    configValues.METRICS_API_KEY = "secret-key";

    expect(guard.canActivate(createMockContext())).toBe(false);
  });

  it("denies access with invalid bearer token", () => {
    configValues.METRICS_API_KEY = "secret-key";

    expect(
      guard.canActivate(
        createMockContext({ authorization: "Bearer wrong-key" }),
      ),
    ).toBe(false);
  });

  it("denies access with non-Bearer scheme", () => {
    configValues.METRICS_API_KEY = "secret-key";

    expect(
      guard.canActivate(
        createMockContext({ authorization: "Basic secret-key" }),
      ),
    ).toBe(false);
  });

  it("grants access with valid bearer token", () => {
    configValues.METRICS_API_KEY = "secret-key";

    expect(
      guard.canActivate(
        createMockContext({ authorization: "Bearer secret-key" }),
      ),
    ).toBe(true);
  });
});

