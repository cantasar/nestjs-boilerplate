import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainException } from '../errors/domain.exception';
import { CommonErrorCode } from '../errors/error-codes';
import { resolveErrorDefinition } from '../errors/error-registry';

/**
 * The single place errors are serialized into the failure envelope
 * (`{ success: false, error: { code, message, details? } }`). Three cases:
 *
 *  1. `DomainException` — trusted `code` + status are read straight off the
 *     exception (already resolved from the registry).
 *  2. Framework `HttpException` (incl. `ValidationPipe`) — mapped to a generic
 *     registry code by HTTP status; 400s carry the per-field messages as `details`.
 *  3. Anything else — a generic `500` (`COMMON_INTERNAL_ERROR`). The internal
 *     message / stack is logged server-side and never leaked to the client.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const resolved = this.resolve(exception);
    this.logServerSide(resolved.status, resolved.code, request, exception);

    response.status(resolved.status).json({
      success: false,
      error: {
        code: resolved.code,
        message: resolved.message,
        ...(resolved.details ? { details: resolved.details } : {}),
      },
    });
  }

  private resolve(exception: unknown): {
    status: number;
    code: string;
    message: string;
    details?: string[];
  } {
    // Case 1: domain error — status + code already resolved from the registry.
    if (exception instanceof DomainException) {
      const payload = exception.getResponse() as {
        code: string;
        message: string;
        details?: string[];
      };
      return {
        status: exception.getStatus(),
        code: payload.code,
        message: payload.message,
        details: payload.details,
      };
    }

    // Case 2: framework HttpException (ValidationPipe, guards, 404, ...).
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = this.codeForStatus(status);
      const definition = resolveErrorDefinition(code);
      const details = this.extractValidationDetails(exception);
      return {
        status,
        code,
        message: definition.message,
        details,
      };
    }

    // Case 3: unknown / unexpected — generic 500, no internals leaked.
    const definition = resolveErrorDefinition(CommonErrorCode.INTERNAL_ERROR);
    return {
      status: definition.httpStatus,
      code: definition.code,
      message: definition.message,
    };
  }

  private codeForStatus(status: number): CommonErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return CommonErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return CommonErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return CommonErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return CommonErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return CommonErrorCode.CONFLICT;
      default:
        return CommonErrorCode.INTERNAL_ERROR;
    }
  }

  // Pull the per-field message list out of a `ValidationPipe` (or any
  // HttpException) whose payload carries a `message` string array.
  private extractValidationDetails(
    exception: HttpException,
  ): string[] | undefined {
    const payload = exception.getResponse();
    if (typeof payload !== 'object' || payload === null) return undefined;
    const raw = (payload as { message?: unknown }).message;
    if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
      return raw;
    }
    return undefined;
  }

  private logServerSide(
    status: number,
    code: string,
    request: Request,
    exception: unknown,
  ): void {
    const context = `${request.method} ${request.originalUrl ?? request.url} -> ${status} ${code}`;
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      const detail =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(`${context} | ${detail}`, stack);
    } else {
      this.logger.warn(context);
    }
  }
}
