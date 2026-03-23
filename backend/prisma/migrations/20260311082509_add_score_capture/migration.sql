/*
  Warnings:

  - A unique constraint covering the columns `[bayNumber]` on the table `Room` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "bayNumber" INTEGER;

-- CreateTable
CREATE TABLE "ScoreCapture" (
    "id" TEXT NOT NULL,
    "bayNumber" INTEGER NOT NULL,
    "roomId" TEXT,
    "bookingId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "courseName" TEXT,
    "screenshotPath" TEXT,
    "sourceVersion" TEXT,
    "rawPayload" JSONB,
    "capturedAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ScoreCapture_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreCapturePlayer" (
    "id" TEXT NOT NULL,
    "captureId" TEXT NOT NULL,
    "seatIndex" INTEGER,
    "ocrName" TEXT NOT NULL,
    "ocrTotalScore" INTEGER NOT NULL,
    "ocrOverPar" INTEGER,
    "nameConfidence" DOUBLE PRECISION,
    "scoreConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "ScoreCapturePlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ScoreCapture_bayNumber_capturedAt_idx" ON "ScoreCapture"("bayNumber", "capturedAt");

-- CreateIndex
CREATE INDEX "ScoreCapture_status_idx" ON "ScoreCapture"("status");

-- CreateIndex
CREATE INDEX "ScoreCapture_bookingId_idx" ON "ScoreCapture"("bookingId");

-- CreateIndex
CREATE INDEX "ScoreCapturePlayer_captureId_idx" ON "ScoreCapturePlayer"("captureId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_bayNumber_key" ON "Room"("bayNumber");

-- AddForeignKey
ALTER TABLE "ScoreCapture" ADD CONSTRAINT "ScoreCapture_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCapture" ADD CONSTRAINT "ScoreCapture_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreCapturePlayer" ADD CONSTRAINT "ScoreCapturePlayer_captureId_fkey" FOREIGN KEY ("captureId") REFERENCES "ScoreCapture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
