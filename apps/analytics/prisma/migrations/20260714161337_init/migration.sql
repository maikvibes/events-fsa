-- CreateEnum
CREATE TYPE "BroadcastRunStatus" AS ENUM ('dispatched', 'in_progress', 'completed');

-- CreateTable
CREATE TABLE "BroadcastRun" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" "BroadcastRunStatus" NOT NULL DEFAULT 'dispatched',
    "totalBatches" INTEGER,
    "totalTokens" INTEGER,
    "receivedBatches" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "firstCompletionAt" TIMESTAMP(3),
    "lastCompletionAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BroadcastRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BroadcastInstanceStat" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "instance" TEXT NOT NULL,
    "batches" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "BroadcastInstanceStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BroadcastRun_requestedAt_idx" ON "BroadcastRun"("requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BroadcastInstanceStat_runId_instance_key" ON "BroadcastInstanceStat"("runId", "instance");

-- AddForeignKey
ALTER TABLE "BroadcastInstanceStat" ADD CONSTRAINT "BroadcastInstanceStat_runId_fkey" FOREIGN KEY ("runId") REFERENCES "BroadcastRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
