import { createZodDto } from 'nestjs-zod';
import {
  SendToUserSchema,
  RegisterDeviceTokenSchema,
  BroadcastSchema,
} from '@app/shared';

// userId here is the RECIPIENT (in body); the server resolves their device tokens.
export class SendNotificationBodyDto extends createZodDto(SendToUserSchema) {}

// userId is derived from the bearer accessToken (@CurrentUser), not the body.
export class RegisterDeviceTokenBodyDto extends createZodDto(
  RegisterDeviceTokenSchema.omit({ userId: true }),
) {}

// No userId/recipient: broadcasts go to every registered device.
export class BroadcastBodyDto extends createZodDto(BroadcastSchema) {}
