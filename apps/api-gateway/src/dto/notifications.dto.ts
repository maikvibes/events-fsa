import { createZodDto } from 'nestjs-zod';
import { SendNotificationSchema, RegisterDeviceTokenSchema } from '@app/shared';

export class SendNotificationBodyDto extends createZodDto(SendNotificationSchema) {}
export class RegisterDeviceTokenBodyDto extends createZodDto(RegisterDeviceTokenSchema) {}
