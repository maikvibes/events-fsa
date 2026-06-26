import { Injectable, Logger } from '@nestjs/common';
import { RpcException } from '@nestjs/microservices';
import * as crypto from 'crypto';
import type { RegisterDto, LoginDto, ValidateTokenDto } from '@app/shared';
import { AuthResponse, TokenPayload, KafkaTopics } from '@app/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    this.logger.log(`Registering: ${dto.email}`);
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new RpcException({ statusCode: 409, message: 'Email already in use' });

    const password = this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, password },
    });
    this.logger.debug(`Emit ${KafkaTopics.AUTH_USER_CREATED} userId=${user.id}`);
    const accessToken = this.signToken({ userId: user.id, email: user.email });
    return { userId: user.id, email: user.email, name: user.name, accessToken };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`Login: ${dto.email}`);
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !this.verifyPassword(dto.password, user.password)) {
      throw new RpcException({ statusCode: 401, message: 'Invalid credentials' });
    }
    const accessToken = this.signToken({ userId: user.id, email: user.email });
    return { userId: user.id, email: user.email, name: user.name, accessToken };
  }

  async validateToken(dto: ValidateTokenDto): Promise<TokenPayload> {
    this.logger.log('Validating token');
    // TODO: verify JWT with jsonwebtoken + JWT_SECRET from ConfigService
    return { userId: 'user-id', email: 'user@example.com' };
  }

  private hashPassword(password: string): string {
    // TODO: replace with bcrypt
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  private verifyPassword(plain: string, hashed: string): boolean {
    return this.hashPassword(plain) === hashed;
  }

  private signToken(payload: TokenPayload): string {
    // TODO: sign with JWT_SECRET from ConfigService
    return Buffer.from(JSON.stringify(payload)).toString('base64');
  }
}
