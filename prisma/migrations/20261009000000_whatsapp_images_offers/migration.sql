-- AlterEnum
ALTER TYPE "WhatsappKind" ADD VALUE 'OFFER';

-- AlterTable
ALTER TABLE "WhatsappMessage" ADD COLUMN     "header" JSONB,
ADD COLUMN     "offerId" TEXT;

-- CreateTable
CREATE TABLE "WhatsappOffer" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "imageUrl" TEXT,
    "branchIds" TEXT[],
    "audience" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WhatsappOffer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WhatsappMessage_offerId_idx" ON "WhatsappMessage"("offerId");
