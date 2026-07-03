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
  AnnounceEventSchema,
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
import {
  CreateEventBodyDto,
  UpdateEventBodyDto,
  AnnounceEventBodyDto,
} from './dto/events.dto';
import {
  SendNotificationBodyDto,
  RegisterDeviceTokenBodyDto,
  BroadcastBodyDto,
} from './dto/notifications.dto';

@Controller()
export class ApiGatewayController {
  constructor(private readonly apiGatewayService: ApiGatewayService) {}

  @ApiTags('Health')
  @ApiOperation({ summary: 'Health check' })
  @ApiResponse({ status: 200, description: 'Gateway is reachable' })
  @Public()
  @Get('health')
  health() {
    return { status: 'ok' as const };
  }

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
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access token',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Public()
  @Post('auth/login')
  @UsePipes(new ZodValidationPipe(LoginSchema))
  login(@Body() dto: LoginBodyDto) {
    return this.apiGatewayService.login(dto);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Create a new event (admin only)' })
  @ApiBody({ type: CreateEventBodyDto })
  @ApiResponse({ status: 201, description: 'Event created' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @UseGuards(AdminGuard)
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
  @ApiOperation({ summary: 'Browse all events (discovery)' })
  @ApiResponse({ status: 200, description: 'Events returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('events')
  findAllEvents(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.findAllEvents(user.userId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'List events the current user follows' })
  @ApiResponse({ status: 200, description: 'Events returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('events/me')
  findMyEvents(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.findMyEvents(user.userId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Get a single event by ID' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Event found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @Get('events/:eventId')
  findEvent(@Param('eventId', ParseUUIDPipe) eventId: string) {
    return this.apiGatewayService.findEvent(eventId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Update an event (admin only)' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiBody({ type: UpdateEventBodyDto })
  @ApiResponse({ status: 200, description: 'Event updated' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @UseGuards(AdminGuard)
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
  @ApiOperation({ summary: 'Delete an event (admin only)' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Event deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @ApiResponse({ status: 404, description: 'Event not found' })
  @UseGuards(AdminGuard)
  @Delete('events/:eventId')
  deleteEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.deleteEvent(eventId, user.userId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Follow an event (idempotent)' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiResponse({ status: 201, description: 'Now following' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Post('events/:eventId/follow')
  followEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.followEvent(user.userId, eventId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: 'Unfollow an event' })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiResponse({ status: 200, description: 'Unfollowed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Delete('events/:eventId/follow')
  unfollowEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: TokenPayload,
  ) {
    return this.apiGatewayService.unfollowEvent(user.userId, eventId);
  }

  @ApiTags('Events')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: "Send a manual announcement to an event's followers (admin only)",
  })
  @ApiParam({
    name: 'eventId',
    description: 'UUID of the event',
    format: 'uuid',
  })
  @ApiBody({ type: AnnounceEventBodyDto })
  @ApiResponse({ status: 201, description: 'Announcement queued' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
  @UseGuards(AdminGuard)
  @Post('events/:eventId/announce')
  @UsePipes(new ZodValidationPipe(AnnounceEventSchema.omit({ eventId: true })))
  announceEvent(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Body() dto: { title: string; body: string },
  ) {
    return this.apiGatewayService.announceEvent({ ...dto, eventId });
  }

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({
    summary: "Send a push notification to a specific user's devices",
  })
  @ApiBody({ type: SendNotificationBodyDto })
  @ApiResponse({ status: 201, description: 'Notification sent' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
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
  })
  @ApiBody({ type: BroadcastBodyDto })
  @ApiResponse({ status: 202, description: 'Broadcast accepted for delivery' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Admin only' })
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
  @ApiOperation({ summary: 'Register a device token for push notifications' })
  @ApiBody({ type: RegisterDeviceTokenBodyDto })
  @ApiResponse({ status: 201, description: 'Token registered' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
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

  @ApiTags('Notifications')
  @ApiBearerAuth('bearerAuth')
  @ApiOperation({ summary: "List the current user's notification history" })
  @ApiResponse({ status: 200, description: 'Notifications returned' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @Get('notifications/me')
  listMyNotifications(@CurrentUser() user: TokenPayload) {
    return this.apiGatewayService.listMyNotifications(user.userId);
  }
}
