import { ClientProviderOptions, Transport } from '@nestjs/microservices';

export const AUTH_SERVICE = 'AUTH_SERVICE';
export const EVENTS_SERVICE = 'EVENTS_SERVICE';
export const NOTIFICATIONS_SERVICE = 'NOTIFICATIONS_SERVICE';
export const EVENTS_KAFKA_PRODUCER = 'EVENTS_KAFKA_PRODUCER';
export const NOTIFICATIONS_KAFKA_PRODUCER = 'NOTIFICATIONS_KAFKA_PRODUCER';

export const kafkaClientConfig = (serviceName: string): ClientProviderOptions => {
  const id = serviceName.toLowerCase().replace(/_/g, '-');
  return {
    name: serviceName,
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: `${id}-client`,
        brokers: [(process.env.KAFKA_BROKER ?? 'localhost:9092')],
      },
      consumer: {
        groupId: `${id}-consumer`,
      },
    },
  };
};
