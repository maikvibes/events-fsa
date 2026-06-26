export const AuthPatterns = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  VALIDATE_TOKEN: 'auth.validate-token',
} as const;

export interface AuthResponse {
  userId: string;
  email: string;
  name: string;
  accessToken: string;
}

export interface TokenPayload {
  userId: string;
  email: string;
  iat?: number;
  exp?: number;
}
