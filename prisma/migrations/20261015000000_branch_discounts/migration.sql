-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "productDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "productDiscountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "productDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "serviceDiscountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
ADD COLUMN     "serviceDiscountType" "DiscountType" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "serviceDiscountValue" DECIMAL(10,2) NOT NULL DEFAULT 0.00;

-- CreateTable
CREATE TABLE "BranchDiscount" (
    "branchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "serviceType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "serviceValue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "productType" "DiscountType" NOT NULL DEFAULT 'PERCENTAGE',
    "productValue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchDiscount_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "BranchDiscount" ADD CONSTRAINT "BranchDiscount_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
