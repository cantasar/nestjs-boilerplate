import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches all errors, returns consistent JSON response.
 * - HttpException: status + message are used
 * - Others: 500 Internal Server Error
 * - 5xx: error log, 4xx: warn log
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status = this.getStatus(exception);
    const message = this.getMessage(exception);

    const body = {
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    this.log(status, body, exception);
    response.status(status).json(body);
  }

  private getStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private getMessage(exception: unknown): string | string[] {
    if (!(exception instanceof HttpException)) {
      return 'Internal Server Error';
    }

    const body = exception.getResponse();
    if (typeof body === 'string') return body;
    if (typeof body === 'object' && body !== null && 'message' in body) {
      return (body as { message: string | string[] }).message;
    }
    return 'Unexpected error';
  }

  private log(status: number, body: object, exception: unknown): void {
    const isServerError = status >= 500;

    if (isServerError) {
      const stack = exception instanceof Error ? exception.stack : '';
      this.logger.error(JSON.stringify(body), stack);
    } else {
      this.logger.warn(JSON.stringify(body));
    }
  }
}
