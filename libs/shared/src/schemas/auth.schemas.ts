import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
  name: z.string().min(1).max(100).trim(),
});

export const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const ValidateTokenSchema = z.object({
  token: z.string().min(1),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type ValidateTokenDto = z.infer<typeof ValidateTokenSchema>;
