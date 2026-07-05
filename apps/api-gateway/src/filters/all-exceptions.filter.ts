import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { RpcException } from '@nestjs/microservices';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: unknown[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string) ?? message;
        errors = b.errors as unknown[] | undefined;
      } else {
        message = String(body);
      }
    } else if (exception instanceof RpcException) {
      const rpcError = exception.getError();
      if (typeof rpcError === 'object' && rpcError !== null) {
        const e = rpcError as Record<string, unknown>;
        status = (e.statusCode as number) ?? HttpStatus.BAD_GATEWAY;
        message = (e.message as string) ?? message;
        errors = e.errors as unknown[] | undefined;
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'statusCode' in exception
    ) {
      // A downstream microservice error. The RpcException instance does not
      // survive the Kafka transport, so it reaches this filter as a plain
      // { statusCode, message, errors? } object. Map it to the HTTP status the
      // service intended (e.g. 409 for a duplicate email) instead of falling
      // through to a generic 500.
      const e = exception as Record<string, unknown>;
      status = (e.statusCode as number) ?? status;
      message = (e.message as string) ?? message;
      errors = e.errors as unknown[] | undefined;
    } else {
      this.logger.error(
        'Unhandled exception',
        exception instanceof Error ? exception.stack : exception,
      );
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      ...(errors && { errors }),
      timestamp: new Date().toISOString(),
    });
  }
}
