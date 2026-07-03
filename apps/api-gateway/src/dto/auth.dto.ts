import { createZodDto } from 'nestjs-zod';
import { RegisterSchema, LoginSchema, UpdateUserRoleSchema } from '@app/shared';

export class RegisterBodyDto extends createZodDto(RegisterSchema) {}
export class LoginBodyDto extends createZodDto(LoginSchema) {}
export class UpdateUserRoleBodyDto extends createZodDto(UpdateUserRoleSchema) {}
