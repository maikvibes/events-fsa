import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(AuthModule, {
    transport: Transport.KAFKA,
    options: {
      client: kafkaBaseClientOptions('auth'),
      consumer: {
        groupId: 'auth-consumer',
      },
    },
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      exceptionFactory: (errors) => new RpcException({ statusCode: 400, message: errors }),
    }),
  );

  await app.listen();
}
bootstrap();
