import { createZodDto } from 'nestjs-zod';
import { SendNotificationSchema, RegisterDeviceTokenSchema } from '@app/shared';

// userId is derived from the bearer accessToken (@CurrentUser), not the body.
export class SendNotificationBodyDto extends createZodDto(
  SendNotificationSchema.omit({ userId: true }),
) {}
export class RegisterDeviceTokenBodyDto extends createZodDto(
  RegisterDeviceTokenSchema.omit({ userId: true }),
) {}
