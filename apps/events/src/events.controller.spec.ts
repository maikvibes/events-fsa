import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

const sampleEvent = {
  eventId: '1',
  userId: 'u1',
  title: 'Title',
  description: 'Desc',
  date: new Date('2026-08-01T00:00:00.000Z'),
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
  updatedAt: new Date('2026-07-02T00:00:00.000Z'),
};

describe('EventsController', () => {
  let controller: EventsController;
  const eventsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findFollowedByUser: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    follow: jest.fn(),
    unfollow: jest.fn(),
    announce: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [{ provide: EventsService, useValue: eventsService }],
    }).compile();

    controller = module.get<EventsController>(EventsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findOne converts Date fields to ISO strings on the wire', async () => {
    eventsService.findOne.mockResolvedValue(sampleEvent);
    const result = await controller.findOne({ eventId: '1' });
    expect(result).toEqual({
      eventId: '1',
      userId: 'u1',
      title: 'Title',
      description: 'Desc',
      date: '2026-08-01T00:00:00.000Z',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-02T00:00:00.000Z',
    });
  });

  it('update maps only the provided optional fields onto the dto', async () => {
    eventsService.update.mockResolvedValue(sampleEvent);
    await controller.update({ eventId: '1', userId: 'u1', title: 'New' });
    expect(eventsService.update).toHaveBeenCalledWith({
      eventId: '1',
      userId: 'u1',
      title: 'New',
    });
  });

  it('delete returns an empty message', async () => {
    eventsService.delete.mockResolvedValue(undefined);
    const result = await controller.delete({ eventId: '1', userId: 'u1' });
    expect(result).toEqual({});
  });
});
