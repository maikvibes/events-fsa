import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { NotificationsModule } from './notifications.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(NotificationsModule, {
    transport: Transport.KAFKA,
    options: {
      client: kafkaBaseClientOptions('notifications'),
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
