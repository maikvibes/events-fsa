import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationsModule, {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'notifications',
        brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
      },
      consumer: {
        groupId: 'notifications-consumer',
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
