import { Test, TestingModule } from '@nestjs/testing';
import { ApiGatewayController } from './api-gateway.controller';
import { ApiGatewayService } from './api-gateway.service';

describe('ApiGatewayController', () => {
  let controller: ApiGatewayController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiGatewayController],
      providers: [
        {
          provide: ApiGatewayService,
          useValue: {
            register: jest.fn(),
            login: jest.fn(),
            createEvent: jest.fn(),
            findEventsByUser: jest.fn(),
            findEvent: jest.fn(),
            updateEvent: jest.fn(),
            deleteEvent: jest.fn(),
            sendNotification: jest.fn(),
            registerDeviceToken: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ApiGatewayController>(ApiGatewayController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
