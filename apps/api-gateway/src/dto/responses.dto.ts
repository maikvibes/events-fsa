import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// Every successful response is wrapped by TransformInterceptor in this envelope.
const envelope = <T extends z.ZodTypeAny>(data: T) =>
  z.object({
    success: z.literal(true).meta({ description: 'Always true on success.' }),
    data,
    timestamp: z.string().meta({
      description: 'ISO 8601 timestamp when the response was produced.',
      example: '2026-07-03T10:15:30.000Z',
    }),
  });

const timestampExample = '2026-07-03T10:15:30.000Z';

// --- Data payloads -------------------------------------------------------

const AuthData = z.object({
  userId: z.uuid().meta({ example: '11111111-2222-3333-4444-555555555555' }),
  email: z.email().meta({ example: 'ada.lovelace@fsa.dev' }),
  name: z.string().meta({ example: 'Ada Lovelace' }),
  accessToken: z.string().meta({
    description:
      'Signed JWT (valid 7 days). Send as `Authorization: Bearer <token>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  }),
});

const EventData = z.object({
  eventId: z.uuid().meta({ example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' }),
  userId: z.uuid().meta({ example: '11111111-2222-3333-4444-555555555555' }),
  title: z.string().meta({ example: 'FSA Tech Meetup' }),
  description: z.string().meta({
    example: 'An evening of talks on Node.js microservices and Kafka.',
  }),
  date: z.string().meta({
    description: 'Event start time (ISO 8601).',
    example: '2026-09-01T18:30:00.000Z',
  }),
  createdAt: z.string().meta({ example: timestampExample }),
  updatedAt: z.string().meta({ example: timestampExample }),
});

const DeliveryResult = z.object({
  sent: z.number().int().meta({
    description: 'Number of devices the notification was delivered to.',
    example: 3,
  }),
  failed: z.number().int().meta({
    description: 'Number of devices that failed delivery.',
    example: 0,
  }),
});

// --- Response DTOs -------------------------------------------------------

export class AuthResponseDto extends createZodDto(envelope(AuthData)) {}

export class EventResponseDto extends createZodDto(envelope(EventData)) {}

export class EventListResponseDto extends createZodDto(
  envelope(z.array(EventData)),
) {}

export class HealthResponseDto extends createZodDto(
  envelope(z.object({ status: z.literal('ok').meta({ example: 'ok' }) })),
) {}

export class SendNotificationResponseDto extends createZodDto(
  envelope(DeliveryResult),
) {}

export class BroadcastResponseDto extends createZodDto(
  envelope(
    z.object({
      accepted: z.literal(true).meta({ example: true }),
      message: z.string().meta({ example: 'Broadcast queued for delivery' }),
    }),
  ),
) {}

export class RegisterTokenResponseDto extends createZodDto(
  envelope(
    z.null().meta({ description: 'No payload; the token was upserted.' }),
  ),
) {}

export class DeleteEventResponseDto extends createZodDto(
  envelope(
    z.null().meta({ description: 'No payload; the event was deleted.' }),
  ),
) {}

// Error envelope emitted by AllExceptionsFilter for every 4xx/5xx.
export class ErrorResponseDto extends createZodDto(
  z.object({
    success: z.literal(false).meta({ description: 'Always false on error.' }),
    statusCode: z.number().int().meta({ example: 400 }),
    message: z.string().meta({ example: 'Validation error' }),
    errors: z
      .array(z.unknown())
      .optional()
      .meta({ description: 'Field-level validation issues, when applicable.' }),
    timestamp: z.string().meta({ example: timestampExample }),
  }),
) {}
