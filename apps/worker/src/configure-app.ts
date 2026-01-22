import { ConfigService } from "@nestjs/config";
import { NestFastifyApplication } from "@nestjs/platform-fastify";

/**
 * Configure admin route authentication for the worker app.
 *
 * Bull Board routes are registered directly via Fastify plugin, bypassing NestJS middleware.
 * We use a global Fastify preHandler hook to enforce x-admin-key authentication on /admin/* routes.
 */
export function configureAdminAuth(app: NestFastifyApplication): void {
  const configService = app.get(ConfigService);
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook("preHandler", async (request, reply) => {
    // Only apply to /admin/* routes
    if (!request.url.startsWith("/admin/")) {
      return;
    }

    const adminKey = configService.get<string>("ADMIN_API_KEY");
    const providedKey = request.headers["x-admin-key"];

    if (!adminKey) {
      return reply.status(401).send({
        statusCode: 401,
        message: "Unauthorized: Admin API key not configured",
      });
    }

    if (!providedKey || providedKey !== adminKey) {
      return reply.status(401).send({
        statusCode: 401,
        message: "Unauthorized: Invalid or missing admin API key",
      });
    }
  });
}

/**
 * Configure the worker application.
 * Call this after creating the NestJS app but before app.init().
 */
export function configureApp(app: NestFastifyApplication): void {
  configureAdminAuth(app);
}
