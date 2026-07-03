-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "EventFollow" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFollow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventFollow_userId_idx" ON "EventFollow"("userId");

-- CreateIndex
CREATE INDEX "EventFollow_eventId_idx" ON "EventFollow"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFollow_userId_eventId_key" ON "EventFollow"("userId", "eventId");

-- AddForeignKey
ALTER TABLE "EventFollow" ADD CONSTRAINT "EventFollow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
