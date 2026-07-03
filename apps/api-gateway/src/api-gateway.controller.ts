import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  UseGuards,
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
import { AdminGuard } from './guards/admin.guard';
import {
  RegisterSchema,
  LoginSchema,
  CreateEventSchema,
  UpdateEventSchema,
  SendToUserSchema,
  BroadcastSchema,
  RegisterDeviceTokenSchema,
} from '@app/shared';
import type {
  TokenPayload,
  CreateEventDto,
  UpdateEventDto,
  SendToUserDto,
  BroadcastDto,
  RegisterDeviceTokenDto,
} from '@app/shared';
import { RegisterBodyDto, LoginBodyDto } from './dto/auth.dto';
import { CreateEventBodyDto, UpdateEventBodyDto } from './dto/events.dto';
import {
  SendNotificationBodyDto,
  RegisterDeviceTokenBodyDto,
  BroadcastBodyDto,
} from './dto/notifications.dto';
import {
  AuthResponseDto,
  EventResponseDto,
  EventListResponseDto,
  HealthResponseDto,
  SendNotificationResponseDto,
  BroadcastResponseDto,
  RegisterTokenResponseDto,
  DeleteEventResponseDto,
  ErrorResponseDto,
} from './dto/responses.dto';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @ApiTags('Health')
  @ApiOperation({
    summary: 'Health check',
    description:
      'Public liveness probe. Returns `{ status: "ok" }` when the gateway is reachable.',
  })
  @ApiResponse({
    status: 200,
    description: 'Gateway is reachable',
    type: HealthResponseDto,
  })
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

  @ApiTags('Auth')
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates an account and returns the user profile together with a JWT access token.',
  })
  @ApiBody({ type: RegisterBodyDto })
  @ApiResponse({
    status: 201,
    description: 'User registered successfully',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Email already in use',
    type: ErrorResponseDto,
  })
  @Public()
  @Post('auth/register')
  @UsePipes(new ZodValidationPipe(RegisterSchema))
  register(@Body() dto: RegisterBodyDto) {
    return this.apiGatewayService.register(dto);
  }

  @ApiTags('Auth')
  @ApiOperation({
    summary: 'Login and receive JWT token',
    description:
      'Validates credentials and returns the user profile with a JWT access token valid for 7 days.',
  })
  @ApiBody({ type: LoginBodyDto })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access token',
    type: AuthResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    type: ErrorResponseDto,
  })
  @Public()
  @Post('auth/login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginBodyDto) {
    return this.apiGatewayService.login(dto);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Create a new event',
    description: 'Creates an event owned by the authenticated user.',
  })
  @ApiBody({ type: CreateEventBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Event created',
    type: EventResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @Post('events')
  @UsePipes(new ZodValidationPipe(CreateEventSchema.omit({ userId: true })))
  createEvent(
    @Body() dto: Omit<CreateEventDto, 'userId'>,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.createEvent({ ...dto, userId: user.userId });
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: "List the current user's events",
    description:
      'Returns all events owned by the authenticated user, ordered by date.',
  })
  @ApiResponse({
    status: 200,
    description: 'Events returned',
    type: EventListResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @Get('events/me')
  findMyEvents(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.findEventsByUser(user.userId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get a single event by ID' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Event found',
    type: EventResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Event not found',
    type: ErrorResponseDto,
  })
  @Get('events/:eventId')
  findEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.apiGatewayService.findEvent(eventId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Update an event',
    description:
      'Updates one or more fields of an event owned by the authenticated user.',
  })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiBody({ type: UpdateEventBodyDto })
  @ApiResponse({
    status: 200,
    description: 'Event updated',
    type: EventResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Event not found',
    type: ErrorResponseDto,
  })
  @Put('events/:eventId')
  updateEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body(
      new ZodValidationPipe(
        UpdateEventSchema.omit({ userId: true, eventId: true }),
      ),
    )
    dto: Omit<UpdateEventDto, 'eventId' | 'userId'>,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.updateEvent({
      ...dto,
      eventId,
      userId: user.userId,
    });
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Delete an event',
    description: 'Deletes an event owned by the authenticated user.',
  })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
    example: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  })
  @ApiResponse({
    status: 200,
    description: 'Event deleted',
    type: DeleteEventResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Event not found',
    type: ErrorResponseDto,
  })
  @Delete('events/:eventId')
  deleteEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.deleteEvent(eventId, user.userId);
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: "Send a push notification to a specific user's devices",
    description:
      "Admin only. Resolves the recipient's device tokens server-side and multicasts. Returns per-device delivery counts.",
  })
  @ApiBody({ type: SendNotificationBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Notification sent',
    type: SendNotificationResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin only',
    type: ErrorResponseDto,
  })
  @UseGuards(AdminGuard)
  @Post('notifications/send')
  @UsePipes(new ZodValidationPipe(SendToUserSchema))
  sendNotification(@Body() dto: SendToUserDto) {
    // userId here is the RECIPIENT (in body); the server resolves their tokens.
    // Admin-only: sending to an arbitrary recipient is gated behind AdminGuard
    // to prevent any authenticated user from spoofing notifications to others.
    return this.apiGatewayService.sendNotification(dto);
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Broadcast a push notification to all users (admin)',
    description:
      'Admin only. Fire-and-forget: enqueues the broadcast to Kafka and returns 202 immediately; a worker fans out to every registered device.',
  })
  @ApiBody({ type: BroadcastBodyDto })
  @ApiResponse({
    status: 202,
    description: 'Broadcast accepted for delivery',
    type: BroadcastResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Admin only',
    type: ErrorResponseDto,
  })
  @UseGuards(AdminGuard)
  @HttpCode(202)
  @Post('notifications/broadcast')
  @UsePipes(new ZodValidationPipe(BroadcastSchema))
  async broadcast(
    @Body() dto: BroadcastDto,
    @CurrentUser() user: TokenPayload,
  ) {
    // Fire-and-forget: enqueue and return 202; the worker fans out to all devices.
    await this.apiGatewayService.broadcast(dto, user.userId);
    return { accepted: true, message: 'Broadcast queued for delivery' };
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: 'Register a device token for push notifications',
    description:
      'Upserts an FCM/APNs device token for the authenticated user so future notifications can reach this device.',
  })
  @ApiBody({ type: RegisterDeviceTokenBodyDto })
  @ApiResponse({
    status: 201,
    description: 'Token registered',
    type: RegisterTokenResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Validation error',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @Post('notifications/register-token')
  @UsePipes(
    new ZodValidationPipe(RegisterDeviceTokenSchema.omit({ userId: true })),
  )
  registerDeviceToken(
    @Body() dto: Omit<RegisterDeviceTokenDto, 'userId'>,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.registerDeviceToken(
      user.userId,
      dto.token,
      dto.platform,
    );
  }
}
