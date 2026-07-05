import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { status } from '@grpc/grpc-js';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type {
  RegisterDto,
  LoginDto,
  ValidateTokenDto,
  ListUsersQueryDto,
} from '@app/shared';
import {
  AuthResponse,
  ProfileResponse,
  TokenPayload,
  KafkaTopics,
  UserSummary,
  PaginatedUsers,
  Role,
} from '@app/shared';
import { Prisma } from './generated/prisma-client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtSecret: string;
  private readonly jwtExpiresIn = '1h';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.jwtSecret = this.config.getOrThrow<string>('JWT_SECRET');
  }

  async register(dto: RegisterDto): Promise<AuthResponse> {
    this.logger.log(`Registering: ${dto.email}`);
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing)
      throw new RpcException({
        code: status.ALREADY_EXISTS,
        message: 'Email already in use',
      });

    const password = this.hashPassword(dto.password);
    const user = await this.prisma.user.create({
      data: { email: dto.email, name: dto.name, password },
    });
    this.logger.debug(
      `Emit ${KafkaTopics.AUTH_USER_CREATED} userId=${user.id}`,
    );
    const accessToken = this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accessToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    this.logger.log(`Login: ${dto.email}`);
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user || !this.verifyPassword(dto.password, user.password)) {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid credentials',
      });
    }
    const accessToken = this.signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      accessToken,
    };
  }

  async getProfile(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'User not found',
      });
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  async findAll(query: ListUsersQueryDto = {}): Promise<PaginatedUsers> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = query.sortBy ?? 'createdAt';
    const sortOrder = query.sortOrder ?? 'desc';

    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.role) {
      where.role = query.role;
    }
    if (query.createdFrom || query.createdTo) {
      where.createdAt = {
        ...(query.createdFrom ? { gte: new Date(query.createdFrom) } : {}),
        ...(query.createdTo
          ? { lte: new Date(`${query.createdTo}T23:59:59.999Z`) }
          : {}),
      };
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      items: users.map((u) => ({
        userId: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        createdAt: u.createdAt,
      })),
      total,
      page,
      pageSize,
    };
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.prisma.user.delete({ where: { id: userId } });
    } catch {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'User not found',
      });
    }
  }

  async updateUserRole(userId: string, role: Role): Promise<UserSummary> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: { role },
      });
      return {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      };
    } catch {
      throw new RpcException({
        code: status.NOT_FOUND,
        message: 'User not found',
      });
    }
  }

  validateToken(dto: ValidateTokenDto): TokenPayload {
    this.logger.log('Validating token');
    try {
      const payload = jwt.verify(dto.token, this.jwtSecret) as jwt.JwtPayload;
      const role = payload['role'];
      if (role !== 'user' && role !== 'admin') {
        throw new Error('Invalid role claim');
      }
      return {
        userId: payload['userId'] as string,
        email: payload['email'] as string,
        role,
      };
    } catch {
      throw new RpcException({
        code: status.UNAUTHENTICATED,
        message: 'Invalid or expired token',
      });
    }
  }

  private hashPassword(plain: string): string {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto
      .createHmac('sha256', this.jwtSecret)
      .update(plain + salt)
      .digest('hex');
    return `${salt}:${hash}`;
  }

  private verifyPassword(plain: string, stored: string): boolean {
    if (stored.includes(':')) {
      // salted HMAC-SHA256
      const [salt, hash] = stored.split(':', 2);
      const expected = crypto
        .createHmac('sha256', this.jwtSecret)
        .update(plain + salt)
        .digest('hex');
      return crypto.timingSafeEqual(
        Buffer.from(hash, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    }
    // legacy bare SHA256 (no salt)
    const legacy = crypto.createHash('sha256').update(plain).digest('hex');
    return legacy === stored;
  }

  private signToken(payload: TokenPayload): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }
}
