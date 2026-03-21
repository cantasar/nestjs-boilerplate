import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter for consistent HTTP error responses.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = this.resolveHttpStatus(exception);
    const message = this.resolveClientMessage(exception);
    const body: {
      statusCode: number;
      message: string | string[];
      path: string;
      method: string;
      timestamp: string;
      error?: string;
    } = {
      statusCode: status,
      message,
      path: request.originalUrl ?? request.url,
      method: request.method,
      timestamp: new Date().toISOString(),
    };
    const errorLabel = this.resolveErrorLabel(exception);
    if (errorLabel !== undefined) {
      body.error = errorLabel;
    }
    this.logServerSide(status, body, exception);
    response.status(status).json(body);
  }

  private resolveHttpStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveClientMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return 'Internal server error';
    }
    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return payload;
    }
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload
    ) {
      const raw = (payload as { message: unknown }).message;
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw) && raw.every((item) => typeof item === 'string')) {
        return raw;
      }
    }
    return statusSafeMessage(exception.message);
  }

  private resolveErrorLabel(exception: unknown): string | undefined {
    if (!(exception instanceof HttpException)) {
      return undefined;
    }
    const payload = exception.getResponse();
    if (typeof payload === 'object' && payload !== null && 'error' in payload) {
      const label = (payload as { error: unknown }).error;
      return typeof label === 'string' ? label : undefined;
    }
    return undefined;
  }

  private logServerSide(
    status: number,
    body: object,
    exception: unknown,
  ): void {
    const payload = JSON.stringify(body);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      const stack = exception instanceof Error ? exception.stack : undefined;
      const detail =
        exception instanceof Error ? exception.message : String(exception);
      this.logger.error(payload, stack ?? detail);
    } else {
      this.logger.warn(payload);
    }
  }
}

function statusSafeMessage(message: string): string {
  return message.length > 0 ? message : 'Unexpected error';
}
