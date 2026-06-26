import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, RpcException, Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { EventsModule } from './events.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(EventsModule, {
    transport: Transport.KAFKA,
    options: {
      client: kafkaBaseClientOptions('events'),
      consumer: {
        groupId: 'events-consumer',
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
