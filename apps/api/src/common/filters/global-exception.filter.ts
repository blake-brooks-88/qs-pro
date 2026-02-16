import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Logger } from '@nestjs/common';
import {
  AppError,
  appErrorToProblemDetails,
  type ProblemDetails,
  safeContext,
} from '@qpp/backend-shared';
import { SentryExceptionCaptured } from '@sentry/nestjs';
import { FastifyReply, FastifyRequest } from 'fastify';

function getStackTrace(error: unknown): string | undefined {
  if (error instanceof Error) {
    return error.stack;
  }
  return undefined;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  @SentryExceptionCaptured()
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const path = this.sanitizePath(request.url);

    const problemDetails = this.classifyException(exception, path);
    const redactedContext =
      exception instanceof AppError
        ? safeContext(exception.context)
        : undefined;

    if (redactedContext) {
      this.logger.warn({
        message: 'AppError context',
        code: (exception as AppError).code,
        context: redactedContext,
        path,
      });
    }

    if (problemDetails.status >= 500) {
      this.logger.error(
        `[${problemDetails.status}] ${path}`,
        getStackTrace(exception),
      );
    } else {
      this.logger.warn(
        `[${problemDetails.status}] ${path} - ${problemDetails.detail}`,
      );
    }

    // Return RFC 9457 Problem Details
    response
      .status(problemDetails.status)
      .header('Content-Type', 'application/problem+json')
      .send(problemDetails);
  }

  /**
   * Classifies exceptions into RFC 9457 Problem Details.
   *
   * Handles three categories:
   * 1. AppError (domain errors) → Use error codes and policy functions
   * 2. HttpException (NestJS) → Preserve HTTP semantics
   * 3. Unknown errors → Wrap as internal error
   */
  private classifyException(exception: unknown, path: string): ProblemDetails {
    // 1. Domain errors (AppError)
    if (exception instanceof AppError) {
      return {
        ...appErrorToProblemDetails(exception, path),
        code: exception.code,
      };
    }

    // 2. NestJS HttpExceptions (BadRequest, NotFound, Unauthorized, etc.)
    if (exception instanceof HttpException) {
      return this.httpExceptionToProblemDetails(exception, path);
    }

    // 3. Unknown errors → treat as internal server error
    return {
      type: 'urn:qpp:error:internal-error',
      title: 'Internal Server Error',
      status: 500,
      detail: 'An unexpected error occurred',
      instance: path,
    };
  }

  /**
   * Converts NestJS HttpException to Problem Details while preserving HTTP semantics.
   */
  private httpExceptionToProblemDetails(
    exception: HttpException,
    path: string,
  ): ProblemDetails {
    const status = exception.getStatus();
    const response = exception.getResponse();
    const is5xx = status >= 500;

    let detail: string;
    let violations: string[] | undefined;

    if (typeof response === 'string') {
      detail = response;
    } else {
      const responseObj = response as Record<string, unknown>;
      if (Array.isArray(responseObj.violations)) {
        violations = responseObj.violations as string[];
        detail = 'Validation failed';
      } else {
        const msg = responseObj.message;
        detail = Array.isArray(msg)
          ? msg.join(', ')
          : ((msg as string) ?? exception.message);
      }
    }

    return {
      type: `urn:qpp:error:http-${status}`,
      title: this.getHttpStatusTitle(status),
      status,
      detail: is5xx ? 'An unexpected error occurred' : detail,
      instance: path,
      ...(violations ? { violations } : {}),
    };
  }

  /**
   * Maps HTTP status code to human-readable title.
   */
  private getHttpStatusTitle(status: number): string {
    const titleMap = new Map<number, string>([
      [400, 'Bad Request'],
      [401, 'Unauthorized'],
      [403, 'Forbidden'],
      [404, 'Not Found'],
      [405, 'Method Not Allowed'],
      [408, 'Request Timeout'],
      [409, 'Conflict'],
      [410, 'Gone'],
      [413, 'Payload Too Large'],
      [422, 'Unprocessable Entity'],
      [429, 'Too Many Requests'],
      [500, 'Internal Server Error'],
      [501, 'Not Implemented'],
      [502, 'Bad Gateway'],
      [503, 'Service Unavailable'],
      [504, 'Gateway Timeout'],
    ]);

    return titleMap.get(status) ?? `HTTP ${status}`;
  }

  private sanitizePath(url: string): string {
    const idx = url.indexOf('?');
    return idx === -1 ? url : url.slice(0, idx);
  }
}
