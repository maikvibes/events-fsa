import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AuthPatterns } from '@app/shared';
import type { RegisterDto, LoginDto, ValidateTokenDto } from '@app/shared';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @MessagePattern(AuthPatterns.REGISTER)
  register(@Payload() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @MessagePattern(AuthPatterns.LOGIN)
  login(@Payload() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @MessagePattern(AuthPatterns.VALIDATE_TOKEN)
  validateToken(@Payload() dto: ValidateTokenDto) {
    return this.authService.validateToken(dto);
  }

  @MessagePattern(AuthPatterns.GET_PROFILE)
  getProfile(@Payload() dto: { userId: string }) {
    return this.authService.getProfile(dto.userId);
  }

  @MessagePattern(AuthPatterns.LIST_USERS)
  listUsers() {
    return this.authService.findAll();
  }

  @MessagePattern(AuthPatterns.DELETE_USER)
  deleteUser(@Payload() dto: { userId: string }) {
    return this.authService.deleteUser(dto.userId);
  }
}
