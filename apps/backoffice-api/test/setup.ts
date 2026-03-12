import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { FeatureKeySchema } from "@qpp/shared-types";
import { vi } from "vitest";
import { BadRequestException } from "@nestjs/common";

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
      createUser: vi.fn().mockImplementation(async (args: {
        body: { email: string; name: string; password: string; role: string };
      }) => ({
        user: {
          id: "new-user",
          email: args.body.email,
          name: args.body.name,
          role: args.body.role,
        },
      })),
      setRole: vi.fn().mockResolvedValue({}),
      banUser: vi.fn().mockResolvedValue({}),
      unbanUser: vi.fn().mockResolvedValue({}),
      setUserPassword: vi.fn().mockResolvedValue({}),
      removeUser: vi.fn().mockResolvedValue({}),
    },
    handler: vi.fn(),
  },
}));

export async function createTestApp(overrides?: {
  userId?: string;
  role?: string;
}): Promise<{ app: NestFastifyApplication }> {
  const userId = overrides?.userId ?? "test-admin-id";
  const role = overrides?.role ?? "admin";

  mockGetSession.mockResolvedValue({
    user: {
      id: userId,
      role,
      email: `${role}@test.com`,
      name: `Test ${role}`,
    },
    session: { id: "test-session" },
  });

  const { AppModule } = await import("../src/app.module.js");
  const { BackofficeAuditService } = await import(
    "../src/audit/audit.service.js"
  );
  const { FeatureOverridesService } = await import(
    "../src/feature-overrides/feature-overrides.service.js"
  );
  const { InvoicingService } = await import(
    "../src/invoicing/invoicing.service.js"
  );
  const { TenantsService } = await import("../src/tenants/tenants.service.js");

  const module = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(BackofficeAuditService)
    .useValue({ log: vi.fn().mockResolvedValue(undefined) })
    .overrideProvider(FeatureOverridesService)
    .useValue({
      getOverridesForTenant: vi.fn().mockResolvedValue([]),
      setOverride: vi.fn().mockImplementation(async (_tenantId: string, key: string) => {
        const result = FeatureKeySchema.safeParse(key);
        if (!result.success) {
          throw new BadRequestException(
            `Invalid feature key: "${key}". Must be one of: ${FeatureKeySchema.options.join(", ")}`,
          );
        }
      }),
      removeOverride: vi.fn().mockResolvedValue(undefined),
    })
    .overrideProvider(InvoicingService)
    .useValue({
      createInvoicedSubscription: vi.fn().mockResolvedValue({
        invoiceUrl: "https://invoice.test/1",
        subscriptionId: "sub_test",
        invoiceStatus: "open",
        amount: 2500,
        dueDate: null,
        stripeInvoiceId: "in_test",
      }),
      listInvoicesForTenant: vi.fn().mockResolvedValue([]),
      listAllInvoices: vi.fn().mockResolvedValue({
        invoices: [],
        hasMore: false,
        nextCursor: null,
      }),
    })
    .overrideProvider(TenantsService)
    .useValue({
      findAll: vi.fn().mockImplementation(async (query: unknown) => {
        const q = query as { page?: number; limit?: number };
        return { data: [], page: q.page ?? 1, limit: q.limit ?? 25, total: 0 };
      }),
      findById: vi.fn().mockResolvedValue(null),
      lookupByEid: vi.fn().mockResolvedValue(null),
    })
    .compile();

  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app };
}
