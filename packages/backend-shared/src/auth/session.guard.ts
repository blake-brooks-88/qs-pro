import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";

import { ABSOLUTE_TIMEOUT_MS } from "./session-timeout.constants";

type Session = {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  touch(): void;
  delete(): void;
};

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
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

    session.touch();

    // Attach to request for use in controllers.
    request.user = { userId, tenantId, mid };

    return true;
  }
}
