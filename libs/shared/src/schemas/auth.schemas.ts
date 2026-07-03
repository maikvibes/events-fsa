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

export const ListUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(200).optional(),
  role: z.enum(['user', 'admin']).optional(),
  createdFrom: z.iso.date().optional(),
  createdTo: z.iso.date().optional(),
  sortBy: z.enum(['name', 'email', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const UpdateUserRoleSchema = z.object({
  role: z.enum(['user', 'admin']),
});

export type RegisterDto = z.infer<typeof RegisterSchema>;
export type LoginDto = z.infer<typeof LoginSchema>;
export type ValidateTokenDto = z.infer<typeof ValidateTokenSchema>;
export type ListUsersQueryDto = z.infer<typeof ListUsersQuerySchema>;
export type UpdateUserRoleDto = z.infer<typeof UpdateUserRoleSchema>;
