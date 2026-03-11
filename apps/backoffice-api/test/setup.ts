import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { vi } from "vitest";

const mockGetSession = vi.fn();

vi.mock("../src/auth/auth.js", () => ({
  auth: {
    api: {
      getSession: mockGetSession,
      listUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
      createUser: vi.fn().mockResolvedValue({
        user: { id: "new-user", email: "new@test.com", name: "", role: "user" },
      }),
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

  const module = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = module.createNestApplication<NestFastifyApplication>(
    new FastifyAdapter(),
  );

  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  return { app };
}
