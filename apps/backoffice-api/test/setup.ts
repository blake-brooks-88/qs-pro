import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import type { PostgresJsDatabase } from "@qpp/database";
import { boUsers, tenants } from "@qpp/database";
import { vi } from "vitest";

import { DRIZZLE_DB } from "../src/database/database.module.js";
import { STRIPE_CLIENT } from "../src/stripe/stripe.provider.js";

const mockGetSession = vi.fn();

vi.mock("@nest-lab/throttler-storage-redis", () => ({
  ThrottlerStorageRedisService: class ThrottlerStorageRedisService {
    constructor(_url: string) {}

    async increment(
      _key: string,
      ttl: number,
      _limit: number,
      _blockDuration: number,
      _throttlerName: string,
    ): Promise<{
      totalHits: number;
      timeToExpire: number;
      isBlocked: boolean;
      timeToBlockExpire: number;
    }> {
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  },
}));

vi.mock("../src/auth/auth.js", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      createUser: vi.fn().mockImplementation(
        async (args: {
          body: {
            email: string;
            name: string;
            password: string;
            role: string;
          };
        }) => ({
          user: {
            id: "new-user",
            email: args.body.email,
            name: args.body.name,
            role: args.body.role,
          },
        }),
      ),
      setRole: vi.fn().mockResolvedValue({}),
      banUser: vi.fn().mockResolvedValue({}),
      unbanUser: vi.fn().mockResolvedValue({}),
      setUserPassword: vi.fn().mockResolvedValue({}),
      removeUser: vi.fn().mockResolvedValue({}),
    },
    handler: vi.fn(),
  },
}));

function createDefaultStripeMock() {
  return {
    prices: {
      list: vi.fn().mockResolvedValue({ data: [] }),
    },
    customers: {
      create: vi.fn(),
      update: vi.fn(),
    },
    subscriptions: {
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      cancel: vi.fn(),
    },
    invoices: {
      retrieve: vi.fn(),
      update: vi.fn(),
      list: vi.fn().mockResolvedValue({ data: [], has_more: false }),
    },
  };
}

export async function createTestApp(overrides?: {
  userId?: string;
  role?: string;
  stripe?: unknown;
}): Promise<{
  app: NestFastifyApplication;
  db: PostgresJsDatabase;
  stripe: ReturnType<typeof createDefaultStripeMock>;
}> {
  const role = overrides?.role ?? "admin";
  const userId =
    overrides?.userId ??
    `test-${role}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const stripe =
    (overrides?.stripe as ReturnType<typeof createDefaultStripeMock>) ??
    createDefaultStripeMock();

  mockGetSession.mockResolvedValue({
    user: {
      id: userId,
      role,
      email: `${userId}@test.com`,
      name: `Test ${role}`,
    },
    session: { id: "test-session" },
  });

  const { AppModule } = await import("../src/app.module.js");

  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(STRIPE_CLIENT)
    .useValue(stripe)
    .compile();

  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const db = app.get<PostgresJsDatabase>(DRIZZLE_DB);
  await db
    .insert(boUsers)
    .values({
      id: userId,
      name: `Test ${role}`,
      email: `${userId}@test.com`,
      role,
    })
    .onConflictDoUpdate({
      target: boUsers.id,
      set: {
        name: `Test ${role}`,
        email: `${userId}@test.com`,
        role,
      },
    });

  // Sanity: ensure the schema exists and connectivity is working for tests.
  // Avoid asserting on row counts; just ensure a trivial query succeeds.
  await db.select({ id: tenants.id }).from(tenants).limit(1);

  return { app, db, stripe };
}
