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
import { CommonErrorCode } from '../errors/enums/common-error-code.enum';
import { resolveErrorDefinition } from '../errors/error-registry';

/** The only place that writes the error envelope. Unknown errors become a 500 and never leak internals. */
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
    // Domain error: status and code already come from the registry.
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

    // Framework error (ValidationPipe, guards, 404, ...).
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

    // Unknown error: generic 500.
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
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return CommonErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNPROCESSABLE_ENTITY:
        return CommonErrorCode.BUSINESS_RULE_VIOLATION;
      case HttpStatus.TOO_MANY_REQUESTS:
        // Rate limits must not look like a 500 to clients.
        return CommonErrorCode.RATE_LIMITED;
      default:
        // Any other 4xx is still the caller's mistake, not a server error.
        return status < HttpStatus.INTERNAL_SERVER_ERROR
          ? CommonErrorCode.BAD_REQUEST
          : CommonErrorCode.INTERNAL_ERROR;
    }
  }

  // Per-field messages from ValidationPipe.
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
