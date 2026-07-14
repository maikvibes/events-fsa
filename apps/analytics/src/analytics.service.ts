import { Injectable, Logger } from '@nestjs/common';
import type {
  BroadcastRunDetail,
  BroadcastRunSummary,
  NotificationBroadcastBatchCompletedEvent,
  NotificationBroadcastDispatchedEvent,
  NotificationBroadcastCancelledEvent,
} from '@app/shared';
import { PrismaService } from './prisma.service';
import type {
  BroadcastRun,
  BroadcastInstanceStat,
} from './generated/prisma-client';

type RunWithCount = BroadcastRun & { _count?: { instances: number } };
type RunWithInstances = BroadcastRun & { instances: BroadcastInstanceStat[] };

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Dispatcher told us the run's expected totals. Create the run (or fill in
  // metadata if completions already created a stub), then re-check completion in
  // case every batch finished before this event arrived.
  async recordDispatched(
    evt: NotificationBroadcastDispatchedEvent,
  ): Promise<void> {
    await this.prisma.broadcastRun.upsert({
      where: { id: evt.broadcastId },
      create: {
        id: evt.broadcastId,
        title: evt.title,
        body: evt.body,
        requestedBy: evt.requestedBy,
        requestedAt: new Date(evt.requestedAt),
        totalBatches: evt.batches,
        totalTokens: evt.totalTokens,
        status: evt.batches === 0 ? 'completed' : 'dispatched',
        completedAt: evt.batches === 0 ? new Date() : null,
      },
      // Never clobber counters/status accumulated from completions — only fill
      // in the metadata the dispatcher owns.
      update: {
        title: evt.title,
        body: evt.body,
        requestedBy: evt.requestedBy,
        requestedAt: new Date(evt.requestedAt),
        totalBatches: evt.batches,
        totalTokens: evt.totalTokens,
      },
    });
    await this.maybeComplete(evt.broadcastId);
  }

  // A worker finished a batch. Increment its per-instance tally and the run
  // aggregate atomically, then check whether the run is now complete.
  async recordCompletion(
    evt: NotificationBroadcastBatchCompletedEvent,
  ): Promise<void> {
    const { broadcastId, processedBy, sent, failed } = evt;
    const completedAt = new Date(evt.completedAt);

    await this.prisma.$transaction(async (tx) => {
      // Ensure the run row exists (a completion can arrive before the dispatched
      // event). Create a stub the dispatched event will later enrich.
      await tx.broadcastRun.upsert({
        where: { id: broadcastId },
        create: {
          id: broadcastId,
          title: '',
          body: '',
          requestedBy: '',
          requestedAt: completedAt,
          status: 'in_progress',
          receivedBatches: 1,
          sent,
          failed,
          firstCompletionAt: completedAt,
          lastCompletionAt: completedAt,
        },
        update: {
          receivedBatches: { increment: 1 },
          sent: { increment: sent },
          failed: { increment: failed },
          lastCompletionAt: completedAt,
        },
      });

      // Stamp firstCompletionAt / flip to in_progress exactly once. Guarded on
      // completedAt so a late completion can't revive a cancelled/completed run.
      await tx.broadcastRun.updateMany({
        where: { id: broadcastId, firstCompletionAt: null, completedAt: null },
        data: { firstCompletionAt: completedAt, status: 'in_progress' },
      });

      await tx.broadcastInstanceStat.upsert({
        where: {
          runId_instance: { runId: broadcastId, instance: processedBy },
        },
        create: {
          runId: broadcastId,
          instance: processedBy,
          batches: 1,
          sent,
          failed,
        },
        update: {
          batches: { increment: 1 },
          sent: { increment: sent },
          failed: { increment: failed },
        },
      });
    });

    await this.maybeComplete(broadcastId);
  }

  // Admin cancelled the run. Mark it terminal; guarded so a late completion
  // can't flip it back. Upsert a stub if the cancel somehow arrives first.
  async recordCancelled(
    evt: NotificationBroadcastCancelledEvent,
  ): Promise<void> {
    const cancelledAt = new Date(evt.cancelledAt);
    await this.prisma.broadcastRun.upsert({
      where: { id: evt.broadcastId },
      create: {
        id: evt.broadcastId,
        title: '',
        body: '',
        requestedBy: evt.cancelledBy,
        requestedAt: cancelledAt,
        status: 'cancelled',
        completedAt: cancelledAt,
      },
      update: {},
    });
    await this.prisma.broadcastRun.updateMany({
      where: { id: evt.broadcastId, completedAt: null },
      data: { status: 'cancelled', completedAt: cancelledAt },
    });
    this.logger.warn(`Broadcast ${evt.broadcastId} marked cancelled`);
  }

  // Flip to completed once we've seen every expected batch. Guarded updateMany
  // so concurrent completions can't double-complete, and so a cancelled run
  // (completedAt already set) is never resurrected to "completed".
  private async maybeComplete(broadcastId: string): Promise<void> {
    const run = await this.prisma.broadcastRun.findUnique({
      where: { id: broadcastId },
    });
    if (
      run &&
      run.status !== 'cancelled' &&
      run.totalBatches !== null &&
      run.receivedBatches >= run.totalBatches &&
      run.completedAt === null
    ) {
      const res = await this.prisma.broadcastRun.updateMany({
        where: { id: broadcastId, completedAt: null },
        data: { status: 'completed', completedAt: new Date() },
      });
      if (res.count) {
        this.logger.log(
          `Broadcast ${broadcastId} completed: ${run.receivedBatches} batches, ${run.sent} sent, ${run.failed} failed`,
        );
      }
    }
  }

  async listRuns(limit = 25): Promise<BroadcastRunSummary[]> {
    const runs = await this.prisma.broadcastRun.findMany({
      orderBy: { requestedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
      include: { _count: { select: { instances: true } } },
    });
    return runs.map((r) => this.toSummary(r));
  }

  async getRun(broadcastId: string): Promise<BroadcastRunDetail | null> {
    const run = await this.prisma.broadcastRun.findUnique({
      where: { id: broadcastId },
      include: { instances: { orderBy: { batches: 'desc' } } },
    });
    return run ? this.toDetail(run) : null;
  }

  async getLatestRun(): Promise<BroadcastRunDetail | null> {
    const run = await this.prisma.broadcastRun.findFirst({
      orderBy: { requestedAt: 'desc' },
      include: { instances: { orderBy: { batches: 'desc' } } },
    });
    return run ? this.toDetail(run) : null;
  }

  private toSummary(r: RunWithCount): BroadcastRunSummary {
    return {
      broadcastId: r.id,
      title: r.title,
      body: r.body,
      requestedBy: r.requestedBy,
      status: r.status,
      totalBatches: r.totalBatches,
      totalTokens: r.totalTokens,
      receivedBatches: r.receivedBatches,
      sent: r.sent,
      failed: r.failed,
      instanceCount: r._count?.instances ?? 0,
      requestedAt: r.requestedAt.toISOString(),
      firstCompletionAt: r.firstCompletionAt?.toISOString() ?? null,
      lastCompletionAt: r.lastCompletionAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    };
  }

  private toDetail(r: RunWithInstances): BroadcastRunDetail {
    return {
      ...this.toSummary({ ...r, _count: { instances: r.instances.length } }),
      instances: r.instances.map((i) => ({
        instance: i.instance,
        batches: i.batches,
        sent: i.sent,
        failed: i.failed,
      })),
    };
  }
}
