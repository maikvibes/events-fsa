import { Controller } from '@nestjs/common';
import { EventPattern, MessagePattern, Payload } from '@nestjs/microservices';
import { AnalyticsService } from './analytics.service';
import { AnalyticsPatterns, KafkaTopics } from '@app/shared';
import type {
  NotificationBroadcastDispatchedEvent,
  NotificationBroadcastBatchCompletedEvent,
} from '@app/shared';

@Controller()
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  // --- Kafka consumers: build the run history ---

  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST_DISPATCHED)
  onDispatched(@Payload() event: NotificationBroadcastDispatchedEvent) {
    return this.analytics.recordDispatched(event);
  }

  @EventPattern(KafkaTopics.NOTIFICATION_BROADCAST_BATCH_COMPLETED)
  onBatchCompleted(@Payload() event: NotificationBroadcastBatchCompletedEvent) {
    return this.analytics.recordCompletion(event);
  }

  // --- Request/reply: served to the gateway for the web app ---

  @MessagePattern(AnalyticsPatterns.LIST_BROADCAST_RUNS)
  listRuns(@Payload() dto: { limit?: number }) {
    return this.analytics.listRuns(dto?.limit);
  }

  @MessagePattern(AnalyticsPatterns.GET_BROADCAST_RUN)
  getRun(@Payload() dto: { broadcastId: string }) {
    return this.analytics.getRun(dto.broadcastId);
  }

  @MessagePattern(AnalyticsPatterns.GET_LATEST_BROADCAST_RUN)
  getLatestRun() {
    return this.analytics.getLatestRun();
  }
}
