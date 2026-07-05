import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    register: jest.fn(),
    login: jest.fn(),
    validateToken: jest.fn(),
    getProfile: jest.fn(),
    findAll: jest.fn(),
    updateUserRole: jest.fn(),
    deleteUser: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('listUsers stringifies createdAt and preserves pagination + role', async () => {
    authService.findAll.mockResolvedValue({
      items: [
        {
          userId: '1',
          email: 'a@b.com',
          name: 'A',
          role: 'admin',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
      total: 1,
      page: 2,
      pageSize: 20,
    });

    const result = await controller.listUsers({ page: 2 });

    expect(authService.findAll).toHaveBeenCalledWith({ page: 2 });
    expect(result).toEqual({
      items: [
        {
          userId: '1',
          email: 'a@b.com',
          name: 'A',
          role: 'admin',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 2,
      pageSize: 20,
    });
  });

  it('updateUserRole delegates and returns a wire UserSummary', async () => {
    authService.updateUserRole.mockResolvedValue({
      userId: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const result = await controller.updateUserRole({
      userId: '1',
      role: 'admin',
    });

    expect(authService.updateUserRole).toHaveBeenCalledWith('1', 'admin');
    expect(result).toEqual({
      userId: '1',
      email: 'a@b.com',
      name: 'A',
      role: 'admin',
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('deleteUser delegates and returns an empty message', async () => {
    authService.deleteUser.mockResolvedValue(undefined);
    const result = await controller.deleteUser({ userId: '1' });
    expect(authService.deleteUser).toHaveBeenCalledWith('1');
    expect(result).toEqual({});
  });
});
