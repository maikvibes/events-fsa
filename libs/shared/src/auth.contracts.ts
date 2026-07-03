export const AuthPatterns = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  VALIDATE_TOKEN: 'auth.validate-token',
  GET_PROFILE: 'auth.get-profile',
  LIST_USERS: 'auth.list-users',
  DELETE_USER: 'auth.delete-user',
} as const;

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
}

export interface ProfileResponse {
  userId: string;
  email: string;
  name: string;
}

export interface UserSummary {
  userId: string;
  email: string;
  name: string;
  createdAt: Date;
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}
