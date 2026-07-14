import { NestFactory } from '@nestjs/core';
import {
  MicroserviceOptions,
  RpcException,
  Transport,
} from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import { AnalyticsModule } from './analytics.module';
import { kafkaBaseClientOptions } from '@app/shared/kafka-config';

async function bootstrap() {
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AnalyticsModule,
    {
      transport: Transport.KAFKA,
      options: {
        client: kafkaBaseClientOptions('analytics'),
        consumer: {
          groupId: 'analytics-consumer',
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
void bootstrap();
