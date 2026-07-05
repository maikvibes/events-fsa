import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { EventsModule } from './events.module';
import {
  protoPath,
  grpcLoaderOptions,
  EVENTS_GRPC_PACKAGE,
  EVENTS_PROTO_FILE,
} from '@app/shared';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    EventsModule,
    {
      transport: Transport.GRPC,
      options: {
        package: EVENTS_GRPC_PACKAGE,
        protoPath: protoPath(EVENTS_PROTO_FILE),
        url: `0.0.0.0:${process.env.EVENTS_GRPC_PORT ?? '50052'}`,
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
