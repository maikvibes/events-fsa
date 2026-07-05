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
import { status as GrpcStatus } from '@grpc/grpc-js';

interface GrpcServiceError {
  code: number;
  details: string;
  message: string;
}

function isGrpcServiceError(error: unknown): error is GrpcServiceError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as GrpcServiceError).code === 'number' &&
    typeof (error as GrpcServiceError).details === 'string'
  );
}

const GRPC_TO_HTTP_STATUS: Partial<Record<number, HttpStatus>> = {
  [GrpcStatus.INVALID_ARGUMENT]: HttpStatus.BAD_REQUEST,
  [GrpcStatus.UNAUTHENTICATED]: HttpStatus.UNAUTHORIZED,
  [GrpcStatus.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [GrpcStatus.NOT_FOUND]: HttpStatus.NOT_FOUND,
  [GrpcStatus.ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [GrpcStatus.DEADLINE_EXCEEDED]: HttpStatus.GATEWAY_TIMEOUT,
  [GrpcStatus.UNAVAILABLE]: HttpStatus.SERVICE_UNAVAILABLE,
};

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
      }
    } else if (isGrpcServiceError(exception)) {
      // Errors from the AUTH_SERVICE/EVENTS_SERVICE gRPC clients surface here as
      // plain grpc-js ServiceError objects, never wrapped in RpcException on the
      // client side (see @nestjs/microservices ClientProxy.serializeError, which
      // is a passthrough for every transport). `.details` is the clean message
      // text the microservice threw; `.message` has a "<code> <NAME>:" prefix.
      status = GRPC_TO_HTTP_STATUS[exception.code] ?? HttpStatus.BAD_GATEWAY;
      message = exception.details || exception.message || message;
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
