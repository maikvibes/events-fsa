import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { RegisterDto, LoginDto, ValidateTokenDto } from '@app/shared';
import { AuthResponse, TokenPayload, KafkaTopics } from '@app/shared';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn = '7d';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

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
    try {
      const payload = jwt.verify(dto.token, this.jwtSecret) as jwt.JwtPayload;
      return { userId: payload['userId'] as string, email: payload['email'] as string };
    } catch {
      throw new RpcException({ statusCode: 401, message: 'Invalid or expired token' });
    }
  }

  private hashPassword(plain: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', this.jwtSecret).update(plain + salt).digest('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(plain: string, stored: string): boolean {
    if (stored.includes(':')) {
      // salted HMAC-SHA256
      const [salt, hash] = stored.split(':', 2);
      const expected = crypto.createHmac('sha256', this.jwtSecret).update(plain + salt).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expected, 'hex'));
    }
    // legacy bare SHA256 (no salt)
    const legacy = crypto.createHash('sha256').update(plain).digest('hex');
    return legacy === stored;
  }

  private signToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }
}
