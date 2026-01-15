/* eslint-disable no-console */
import { ConsoleLogger, Injectable, Scope } from "@nestjs/common";

@Injectable({ scope: Scope.TRANSIENT })
export class JsonLogger extends ConsoleLogger {
  override log(message: unknown, context?: string) {
    if (process.env.LOG_FORMAT === "json") {
      console.log(
        JSON.stringify({
          level: "log",
          message,
          context,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      super.log(message, context);
    }
  }

  override error(message: unknown, stack?: string, context?: string) {
    if (process.env.LOG_FORMAT === "json") {
      console.error(
        JSON.stringify({
          level: "error",
          message,
          stack,
          context,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      super.error(message, stack, context);
    }
  }

  override warn(message: unknown, context?: string) {
    if (process.env.LOG_FORMAT === "json") {
      console.warn(
        JSON.stringify({
          level: "warn",
          message,
          context,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      super.warn(message, context);
    }
  }

  override debug(message: unknown, context?: string) {
    if (process.env.LOG_FORMAT === "json") {
      console.debug(
        JSON.stringify({
          level: "debug",
          message,
          context,
          timestamp: new Date().toISOString(),
        }),
      );
    } else {
      super.debug(message, context);
    }
  }
}
