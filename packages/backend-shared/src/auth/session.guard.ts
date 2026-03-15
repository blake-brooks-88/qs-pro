import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { eq, tenants } from "@qpp/database";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";

import { ABSOLUTE_TIMEOUT_MS } from "./session-timeout.constants";

type Session = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  touch(): void;
  delete(): void;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject("DATABASE")
    private readonly db: PostgresJsDatabase,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session: Session | undefined = request.session;

    if (!session) {
      throw new UnauthorizedException("No session found");
    }

    const userId = session.get("userId");
    const tenantId = session.get("tenantId");
    const mid = session.get("mid");

    // Strict type checking: session values can be non-string types
    if (
      typeof userId !== "string" ||
      typeof tenantId !== "string" ||
      typeof mid !== "string" ||
      !userId ||
      !tenantId ||
      !mid
    ) {
      throw new UnauthorizedException("Not authenticated");
    }

    const rawCreatedAt = session.get("createdAt");
    const createdAt =
      typeof rawCreatedAt === "number" ? rawCreatedAt : Date.now();
    if (typeof rawCreatedAt !== "number") {
      session.set("createdAt", createdAt);
    }
    if (Date.now() - createdAt > ABSOLUTE_TIMEOUT_MS) {
      request.sessionExpiredContext = {
        reason: "absolute_timeout",
        userId,
        tenantId,
        mid,
      };
      session.delete();
      throw new UnauthorizedException("Session expired");
    }

    const [tenant] = await this.db
      .select({ deletedAt: tenants.deletedAt })
      .from(tenants)
      .where(eq(tenants.id, tenantId))
      .limit(1);

    if (tenant?.deletedAt) {
      session.delete();
      throw new ForbiddenException("This account has been deactivated.");
    }

    session.touch();

    // Attach to request for use in controllers.
    request.user = { userId, tenantId, mid };

    return true;
  }
}
