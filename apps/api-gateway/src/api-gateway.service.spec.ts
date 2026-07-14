import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { ApiGatewayService } from './api-gateway.service';
import {
  AUTH_SERVICE,
  EVENTS_SERVICE,
  NOTIFICATIONS_SERVICE,
  ANALYTICS_SERVICE,
  SeedProgressService,
} from '@app/shared';

describe('ApiGatewayService', () => {
  let service: ApiGatewayService;
  const authGrpcService = {
    getProfile: jest.fn(() =>
      of({ userId: '1', email: 'a@b.com', name: 'A', role: 'user' }),
    ),
    listUsers: jest.fn(() =>
      of({
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
        page: 1,
        pageSize: 20,
      }),
    ),
    updateUserRole: jest.fn(() =>
      of({
        userId: '1',
        email: 'a@b.com',
        name: 'A',
        role: 'admin',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    ),
  };
  const eventsGrpcService = {
    findOne: jest.fn(() =>
      of({
        eventId: '1',
        userId: 'u1',
        title: 'T',
        description: 'D',
        date: '2026-08-01T00:00:00.000Z',
        createdAt: '2026-07-01T00:00:00.000Z',
        updatedAt: '2026-07-02T00:00:00.000Z',
      }),
    ),
  };
  const authClient = { getService: jest.fn(() => authGrpcService) };
  const eventsClient = { getService: jest.fn(() => eventsGrpcService) };
  const notificationsClient = {
    subscribeToResponseOf: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
  };
  const analyticsClient = {
    subscribeToResponseOf: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    send: jest.fn(() => of(null)),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiGatewayService,
        { provide: AUTH_SERVICE, useValue: authClient },
        { provide: EVENTS_SERVICE, useValue: eventsClient },
        { provide: NOTIFICATIONS_SERVICE, useValue: notificationsClient },
        { provide: ANALYTICS_SERVICE, useValue: analyticsClient },
        { provide: SeedProgressService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    service = module.get<ApiGatewayService>(ApiGatewayService);
    await service.onModuleInit();
  });

  it('listUsers converts each item createdAt back to a real Date, keeps paging', async () => {
    const result = await service.listUsers({ page: 1 });
    expect(authGrpcService.listUsers).toHaveBeenCalledWith({ page: 1 });
    expect(result).toEqual({
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
      page: 1,
      pageSize: 20,
    });
    expect(result.items[0].createdAt).toBeInstanceOf(Date);
  });

  it('updateUserRole forwards the role and converts createdAt back to a Date', async () => {
    const result = await service.updateUserRole('1', 'admin');
    expect(authGrpcService.updateUserRole).toHaveBeenCalledWith({
      userId: '1',
      role: 'admin',
    });
    expect(result.role).toBe('admin');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('findEvent converts date/createdAt/updatedAt back to real Dates', async () => {
    const result = await service.findEvent('1');
    expect(result.date).toBeInstanceOf(Date);
    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it('onModuleInit still wires up the notifications Kafka client', () => {
    expect(notificationsClient.subscribeToResponseOf).toHaveBeenCalledWith(
      'notifications.send-to-user',
    );
    expect(notificationsClient.connect).toHaveBeenCalled();
  });
});
