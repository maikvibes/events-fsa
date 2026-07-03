import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AuthService } from './auth.service';
import { PrismaService } from './prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  const jwtSecret = 'test-secret';

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { getOrThrow: () => jwtSecret },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('signs the role claim into the token on register', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      name: 'New User',
      role: 'user',
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    expect(result.role).toBe('user');
    const decoded = jwt.verify(result.accessToken, jwtSecret) as jwt.JwtPayload;
    expect(decoded.role).toBe('user');
  });

  it('signs a 1 hour expiry on the token', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'new@example.com',
      name: 'New User',
      role: 'user',
    });

    const result = await service.register({
      email: 'new@example.com',
      password: 'password123',
      name: 'New User',
    });

    const decoded = jwt.verify(result.accessToken, jwtSecret) as jwt.JwtPayload;
    expect(decoded.exp! - decoded.iat!).toBe(3600);
  });

  it('includes role on getProfile', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'admin@example.com',
      name: 'Admin',
      role: 'admin',
    });

    const result = await service.getProfile('u1');

    expect(result.role).toBe('admin');
  });

  it('extracts role from a validated token', () => {
    const token = jwt.sign(
      { userId: 'u1', email: 'admin@example.com', role: 'admin' },
      jwtSecret,
      { expiresIn: '1h' },
    );

    const result = service.validateToken({ token });

    expect(result.role).toBe('admin');
  });
});
