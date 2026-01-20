import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import {
  AppError,
  appErrorToProblemDetails,
  type ProblemDetails,
} from '@qpp/backend-shared';
import { FastifyReply, FastifyRequest } from 'fastify';

// Mock Sentry for now as we don't have the SDK installed yet
const Sentry = {
  captureException: (exception: unknown) => {
    // In a real app, this would send to Sentry
    void exception;
  },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();
    const path = this.sanitizePath(request.url);

    // Classify exception and get Problem Details
    const problemDetails = this.classifyException(exception, path);

    // Log appropriately
    if (problemDetails.status >= 500) {
      this.logger.error(`[${problemDetails.status}] ${path}`, exception);
      Sentry.captureException(exception);
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
      return appErrorToProblemDetails(exception, path);
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

    // Extract detail message
    let detail: string;
    if (typeof response === 'string') {
      detail = response;
    } else {
      const msg = (response as Record<string, unknown>).message;
      detail = Array.isArray(msg)
        ? msg.join(', ')
        : ((msg as string) ?? exception.message);
    }

    return {
      type: `urn:qpp:error:http-${status}`,
      title: this.getHttpStatusTitle(status),
      status,
      detail: is5xx ? 'An unexpected error occurred' : detail,
      instance: path,
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
