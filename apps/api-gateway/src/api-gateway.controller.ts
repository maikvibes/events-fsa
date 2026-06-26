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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
import type { TokenPayload, CreateEventDto, UpdateEventDto, SendNotificationDto } from '@app/shared';
import { RegisterBodyDto, LoginBodyDto } from './dto/auth.dto';
import { CreateEventBodyDto, UpdateEventBodyDto } from './dto/events.dto';
import { SendNotificationBodyDto, RegisterDeviceTokenBodyDto } from './dto/notifications.dto';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @ApiTags('Auth')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterBodyDto })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Email already in use' })
  @Public()
  @Post('auth/register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterBodyDto) {
    return this.apiGatewayService.register(dto);
  }

  @ApiTags('Auth')
  @ApiOperation({ summary: 'Login and receive JWT token' })
  @ApiBody({ type: LoginBodyDto })
  @ApiResponse({ status: 200, description: 'Login successful, returns access token' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Public()
  @Post('auth/login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginBodyDto) {
    return this.apiGatewayService.login(dto);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create a new event' })
  @ApiBody({ type: CreateEventBodyDto })
  @ApiResponse({ status: 201, description: 'Event created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('events')
  @UsePipes(new ZodValidationPipe(CreateEventSchema))
  createEvent(@Body() dto: CreateEventDto, @CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.createEvent({ ...dto, userId: user.userId });
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: "List the current user's events" })
  @ApiResponse({ status: 200, description: 'Events returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('events/me')
  findMyEvents(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.findEventsByUser(user.userId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get a single event by ID' })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Get('events/:eventId')
  findEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.apiGatewayService.findEvent(eventId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update an event' })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', format: 'uuid' })
  @ApiBody({ type: UpdateEventBodyDto })
  @ApiResponse({ status: 200, description: 'Event updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Put('events/:eventId')
  updateEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(new ZodValidationPipe(UpdateEventSchema)) dto: Omit<UpdateEventDto, 'eventId'>,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.updateEvent({ ...dto, eventId, userId: user.userId });
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Delete an event' })
  @ApiParam({ name: 'eventId', description: 'UUID of the event', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Delete('events/:eventId')
  deleteEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.deleteEvent(eventId, user.userId);
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Send a push notification to a user' })
  @ApiBody({ type: SendNotificationBodyDto })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('notifications/send')
  @UsePipes(new ZodValidationPipe(SendNotificationSchema))
  sendNotification(@Body() dto: SendNotificationDto) {
    return this.apiGatewayService.sendNotification(dto);
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiBody({ type: RegisterDeviceTokenBodyDto })
  @ApiResponse({ status: 201, description: 'Token registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('notifications/register-token')
  @UsePipes(new ZodValidationPipe(RegisterDeviceTokenSchema))
  registerDeviceToken(@Body() dto: RegisterDeviceTokenBodyDto) {
    return this.apiGatewayService.registerDeviceToken(dto.userId, dto.token, dto.platform);
  }
}
