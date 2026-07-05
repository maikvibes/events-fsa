import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { AuthModule } from './auth.module';
import {
  protoPath,
  grpcLoaderOptions,
  AUTH_GRPC_PACKAGE,
  AUTH_PROTO_FILE,
} from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.GRPC,
      options: {
        package: AUTH_GRPC_PACKAGE,
        protoPath: protoPath(AUTH_PROTO_FILE),
        url: `0.0.0.0:${process.env.AUTH_GRPC_PORT ?? '50051'}`,
        loader: grpcLoaderOptions,
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: () =>
        new RpcException({
          code: status.INVALID_ARGUMENT,
          message: 'Validation failed',
        }),
    }),
  );

  await app.listen();
}
bootstrap();
