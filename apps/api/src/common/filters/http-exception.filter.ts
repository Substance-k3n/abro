import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorResponse } from '@abro/types';
import type { Request, Response } from 'express';

/**
 * Every error leaving apps/api takes the ApiErrorResponse shape (@abro/types),
 * whether it started as a thrown HttpException or an unexpected bug.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { statusCode, code, message, details } = this.normalize(exception);

    if (statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    const body: ApiErrorResponse = {
      statusCode,
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(statusCode).json(body);
  }

  private normalize(exception: unknown): {
    statusCode: number;
    code: string;
    message: string;
    details?: unknown;
  } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const { code, message, details } = body as Record<string, unknown>;
        return {
          statusCode,
          code: typeof code === 'string' ? code : (HttpStatus[statusCode] ?? 'ERROR'),
          message: typeof message === 'string' ? message : exception.message,
          details,
        };
      }

      return { statusCode, code: HttpStatus[statusCode] ?? 'ERROR', message: exception.message };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong.',
    };
  }
}
