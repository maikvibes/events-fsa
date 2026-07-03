export const AuthPatterns = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  VALIDATE_TOKEN: 'auth.validate-token',
  GET_PROFILE: 'auth.get-profile',
  LIST_USERS: 'auth.list-users',
  DELETE_USER: 'auth.delete-user',
  UPDATE_USER_ROLE: 'auth.update-user-role',
} as const;

export type Role = 'user' | 'admin';

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  role: Role;
  accessToken: string;
}

export interface ProfileResponse {
  userId: string;
  email: string;
  name: string;
  role: Role;
}

export interface UserSummary {
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: Date;
}

export interface PaginatedUsers {
  items: UserSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TokenPayload {
  userId: string;
  email: string;
  role: Role;
  iat?: number;
  exp?: number;
}
