import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule } from '@nestjs/microservices';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  ANALYTICS_SERVICE,
  SeedProgressService,
  kafkaClientConfig,
  grpcClientConfig,
  AUTH_GRPC_PACKAGE,
  AUTH_PROTO_FILE,
  EVENTS_GRPC_PACKAGE,
  EVENTS_PROTO_FILE,
} from '@app/shared';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ClientsModule.register([
      grpcClientConfig(
        AUTH_SERVICE,
        AUTH_GRPC_PACKAGE,
        AUTH_PROTO_FILE,
        process.env.AUTH_GRPC_URL ?? 'localhost:50051',
      ),
      grpcClientConfig(
        EVENTS_SERVICE,
        EVENTS_GRPC_PACKAGE,
        EVENTS_PROTO_FILE,
        process.env.EVENTS_GRPC_URL ?? 'localhost:50052',
      ),
      kafkaClientConfig(NOTIFICATIONS_SERVICE),
      kafkaClientConfig(ANALYTICS_SERVICE),
    ]),
  ],
  controllers: [ApiGatewayController],
  providers: [ApiGatewayService, SeedProgressService],
})
export class ApiGatewayModule {}
