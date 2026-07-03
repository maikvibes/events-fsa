import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

// force image rebuild: the LIST_USERS/DELETE_USER handlers never shipped
// because the commit that added them failed CI lint, so this service kept
// running its pre-admin-panel image after the next (lint-fix-only) push only
// rebuilt api-gateway.
async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AuthModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: kafkaBaseClientOptions('auth'),
        consumer: {
          groupId: 'auth-consumer',
        },
      },
    },
  );

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: (errors) =>
        new RpcException({ statusCode: 400, message: errors }),
    }),
  );

  await app.listen();
}
bootstrap();
