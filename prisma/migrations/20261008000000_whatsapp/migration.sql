-- CreateEnum
CREATE TYPE "WhatsappKind" AS ENUM ('BILL', 'REPORT', 'TEST');

-- CreateEnum
CREATE TYPE "WhatsappStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "WhatsappMessage" (
    "id" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "kind" "WhatsappKind" NOT NULL,
    "status" "WhatsappStatus" NOT NULL DEFAULT 'PENDING',
    "to" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "sessionId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "providerMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "WhatsappMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "WhatsappMessage_dedupeKey_key" ON "WhatsappMessage"("dedupeKey");

-- CreateIndex
CREATE INDEX "WhatsappMessage_status_nextAttemptAt_idx" ON "WhatsappMessage"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WhatsappMessage_sessionId_idx" ON "WhatsappMessage"("sessionId");
