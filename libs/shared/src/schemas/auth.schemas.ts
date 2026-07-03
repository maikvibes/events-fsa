import { z } from 'zod';

export const RegisterSchema = z.object({
  email: z.email().meta({
    description: 'Unique email address used to sign in.',
    example: 'ada.lovelace@fsa.dev',
  }),
  password: z.string().min(8).max(128).meta({
    description: 'Plain-text password, 8–128 characters. Hashed server-side.',
    example: 'S3cureP@ssw0rd',
  }),
  name: z.string().min(1).max(100).trim().meta({
    description: 'Display name, 1–100 characters.',
    example: 'Ada Lovelace',
  }),
});

export const LoginSchema = z.object({
  email: z.email().meta({
    description: 'Email address of a registered user.',
    example: 'ada.lovelace@fsa.dev',
  }),
  password: z.string().min(1).meta({
    description: 'Account password.',
    example: 'S3cureP@ssw0rd',
  }),
});

export const ValidateTokenSchema = z.object({
  token: z.string().min(1).meta({
    description: 'JWT access token to validate.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  }),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type ValidateTokenDto = z.infer<typeof ValidateTokenSchema>;
