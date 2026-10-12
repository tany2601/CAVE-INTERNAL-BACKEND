-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryStatus" TEXT,
ADD COLUMN     "errorCode" INTEGER,
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "readAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "WhatsappOffer" ADD COLUMN     "contentHash" TEXT;

-- CreateTable
CREATE TABLE "WhatsappSuppression" (
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsappSuppression_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "WhatsappMessage_providerMessageId_idx" ON "WhatsappMessage"("providerMessageId");

-- CreateIndex
CREATE INDEX "WhatsappOffer_contentHash_createdAt_idx" ON "WhatsappOffer"("contentHash", "createdAt");
