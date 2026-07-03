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

  it('updates a user role', async () => {
    prisma.user.update.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      name: 'A User',
      role: 'admin',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await service.updateUserRole('u1', 'admin');

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { role: 'admin' },
    });
    expect(result.role).toBe('admin');
  });

  it('throws on updateUserRole when the user does not exist', async () => {
    prisma.user.update.mockRejectedValue(new Error('not found'));

    await expect(service.updateUserRole('missing', 'admin')).rejects.toThrow();
  });

  describe('findAll', () => {
    const dbUser = {
      id: 'u1',
      email: 'a@example.com',
      name: 'A',
      role: 'user' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('applies defaults when no query params are given', async () => {
      prisma.user.findMany.mockResolvedValue([dbUser]);
      prisma.user.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(result).toEqual({
        items: [
          {
            userId: 'u1',
            email: 'a@example.com',
            name: 'A',
            role: 'user',
            createdAt: dbUser.createdAt,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
      });
    });

    it('builds search, role, and date-range filters, custom sort and pagination', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      prisma.user.count.mockResolvedValue(0);

      await service.findAll({
        page: 3,
        pageSize: 50,
        search: 'ali',
        role: 'admin',
        createdFrom: '2026-01-01',
        createdTo: '2026-06-30',
        sortBy: 'name',
        sortOrder: 'asc',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { name: { contains: 'ali', mode: 'insensitive' } },
            { email: { contains: 'ali', mode: 'insensitive' } },
          ],
          role: 'admin',
          createdAt: {
            gte: new Date('2026-01-01'),
            lte: new Date('2026-06-30T23:59:59.999Z'),
          },
        },
        orderBy: { name: 'asc' },
        skip: 100,
        take: 50,
      });
    });
  });
});
