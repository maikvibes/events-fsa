import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UsePipes,
} from '@nestjs/common';
import { ApiGatewayService } from './api-gateway.service';
import { ZodValidationPipe } from './pipes/zod-validation.pipe';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  RegisterSchema,
  LoginSchema,
  CreateEventSchema,
  UpdateEventSchema,
  SendNotificationSchema,
  RegisterDeviceTokenSchema,
} from '@app/shared';
import type {
  TokenPayload,
  RegisterDto,
  LoginDto,
  CreateEventDto,
  UpdateEventDto,
  SendNotificationDto,
  RegisterDeviceTokenDto,
} from '@app/shared';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @Public()
  @Post('auth/register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterDto) {
    return this.apiGatewayService.register(dto);
  }

  @Public()
  @Post('auth/login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginDto) {
    return this.apiGatewayService.login(dto);
  }

  @Post('events')
  @UsePipes(new ZodValidationPipe(CreateEventSchema))
  createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.createEvent({ ...dto, userId: user.userId });
  }

  @Get('events/me')
  findMyEvents(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.findEventsByUser(user.userId);
  }

  @Get('events/:eventId')
  findEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.apiGatewayService.findEvent(eventId);
  }

  @Put('events/:eventId')
  updateEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) dto: Omit<UpdateEventDto, 'eventId'>,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.updateEvent({ ...dto, eventId, userId: user.userId });
  }

  @Delete('events/:eventId')
  deleteEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.deleteEvent(eventId, user.userId);
  }

  @Post('notifications/send')
  @UsePipes(new ZodValidationPipe(SendNotificationSchema))
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.apiGatewayService.sendNotification(dto);
  }

  @Post('notifications/register-token')
  @UsePipes(new ZodValidationPipe(RegisterDeviceTokenSchema))
  registerDeviceToken(@Body() dto: RegisterDeviceTokenDto) {
    return this.apiGatewayService.registerDeviceToken(dto.userId, dto.token, dto.platform);
  }
}
