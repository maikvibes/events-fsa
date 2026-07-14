import { Observable } from 'rxjs';
import { Empty } from './grpc-config';

export const AUTH_GRPC_PACKAGE = 'auth';
export const AUTH_PROTO_FILE = 'auth.proto';

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

// --- gRPC wire types (auth.proto) ---

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ValidateTokenRequest {
  token: string;
}

export interface GetProfileRequest {
  userId: string;
}

export interface DeleteUserRequest {
  userId: string;
}

// Mirrors auth.proto ListUsersRequest — every field optional; the gateway just
// forwards its already-parsed ListUsersQueryDto, which is structurally this.
export interface ListUsersRequest {
  page?: number;
  pageSize?: number;
  search?: string;
  role?: Role;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: 'name' | 'email' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface UpdateUserRoleRequest {
  userId: string;
  role: Role;
}

// createdAt travels as an ISO string over the wire (proto3 has no Date type);
// the gateway converts it back to a real Date to keep `UserSummary` accurate.
export interface UserSummaryWire {
  userId: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export interface PaginatedUsersWire {
  items: UserSummaryWire[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuthServiceClient {
  register(data: RegisterRequest): Observable<AuthResponse>;
  login(data: LoginRequest): Observable<AuthResponse>;
  validateToken(data: ValidateTokenRequest): Observable<TokenPayload>;
  getProfile(data: GetProfileRequest): Observable<ProfileResponse>;
  listUsers(data: ListUsersRequest): Observable<PaginatedUsersWire>;
  updateUserRole(data: UpdateUserRoleRequest): Observable<UserSummaryWire>;
  deleteUser(data: DeleteUserRequest): Observable<Empty>;
  seedUsers(data: SeedUsersRequest): Observable<SeedAck>;
}

export interface SeedUsersRequest {
  jobId: string;
  count: number;
  fresh: boolean;
}

export interface SeedAck {
  started: boolean;
}
