import { ClientProviderOptions, Transport } from '@nestjs/microservices';
import { kafkaSaslConfig, kafkaSslConfig } from '@app/shared/tls-config';

export const AUTH_SERVICE = 'AUTH_SERVICE';
export const EVENTS_SERVICE = 'EVENTS_SERVICE';
export const NOTIFICATIONS_SERVICE = 'NOTIFICATIONS_SERVICE';
export const EVENTS_KAFKA_PRODUCER = 'EVENTS_KAFKA_PRODUCER';
export const NOTIFICATIONS_KAFKA_PRODUCER = 'NOTIFICATIONS_KAFKA_PRODUCER';

export const kafkaClientConfig = (serviceName: string): ClientProviderOptions => {
  const id = serviceName.toLowerCase().replace(/_/g, '-');
  const client: Record<string, unknown> = {
    clientId: `${id}-client`,
    brokers: (process.env.KAFKA_BROKER ?? 'kafka:29093').split(',').map((b) => b.trim()),
  };
  const ssl = kafkaSslConfig();
  if (ssl) client.ssl = ssl;
  const sasl = kafkaSaslConfig();
  if (sasl) client.sasl = sasl;
  return {
    name: serviceName,
    transport: Transport.KAFKA,
    options: {
      client,
      consumer: {
        groupId: `${id}-consumer`,
      },
    },
  };
};
