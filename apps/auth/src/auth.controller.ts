import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import type {
  RegisterRequest,
  LoginRequest,
  ValidateTokenRequest,
  GetProfileRequest,
  DeleteUserRequest,
  ListUsersRequest,
  UpdateUserRoleRequest,
  PaginatedUsersWire,
  UserSummary,
  UserSummaryWire,
  AuthResponse,
  ProfileResponse,
  TokenPayload,
} from '@app/shared';
import { Empty } from '@app/shared';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @GrpcMethod('AuthService', 'Register')
  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.authService.register({
      email: data.email,
      password: data.password,
      name: data.name,
    });
  }

  @GrpcMethod('AuthService', 'Login')
  login(data: LoginRequest): Promise<AuthResponse> {
    return this.authService.login({
      email: data.email,
      password: data.password,
    });
  }

  @GrpcMethod('AuthService', 'ValidateToken')
  validateToken(data: ValidateTokenRequest): TokenPayload {
    return this.authService.validateToken({ token: data.token });
  }

  @GrpcMethod('AuthService', 'GetProfile')
  getProfile(data: GetProfileRequest): Promise<ProfileResponse> {
    return this.authService.getProfile(data.userId);
  }

  @GrpcMethod('AuthService', 'ListUsers')
  async listUsers(data: ListUsersRequest): Promise<PaginatedUsersWire> {
    const result = await this.authService.findAll(data);
    return {
      items: result.items.map((u) => this.toWire(u)),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  @GrpcMethod('AuthService', 'UpdateUserRole')
  async updateUserRole(data: UpdateUserRoleRequest): Promise<UserSummaryWire> {
    const user = await this.authService.updateUserRole(data.userId, data.role);
    return this.toWire(user);
  }

  @GrpcMethod('AuthService', 'DeleteUser')
  async deleteUser(data: DeleteUserRequest): Promise<Empty> {
    await this.authService.deleteUser(data.userId);
    return {};
  }

  private toWire(u: UserSummary): UserSummaryWire {
    return {
      userId: u.userId,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt.toISOString(),
    };
  }
}
