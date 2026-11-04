-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "gstProductsCgst" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstProductsInclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstProductsRate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstProductsSgst" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstProductsTaxable" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstServicesCgst" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstServicesInclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gstServicesRate" DECIMAL(5,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstServicesSgst" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstServicesTaxable" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "gstin" TEXT,
ADD COLUMN     "invoiceNumber" TEXT;

-- CreateTable
CREATE TABLE "InvoiceCounter" (
    "fy" TEXT NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "InvoiceCounter_pkey" PRIMARY KEY ("fy")
);

-- CreateIndex
CREATE UNIQUE INDEX "Session_invoiceNumber_key" ON "Session"("invoiceNumber");
