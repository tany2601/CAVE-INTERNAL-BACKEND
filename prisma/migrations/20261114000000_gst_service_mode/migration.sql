-- CreateEnum
CREATE TYPE "GstMode" AS ENUM ('ADD_ON_TOP', 'INCLUDED_IN_PRICE', 'NO_GST');

-- CreateTable
CREATE TABLE "BranchServiceGst" (
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "gstMode" "GstMode" NOT NULL DEFAULT 'ADD_ON_TOP',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BranchServiceGst_pkey" PRIMARY KEY ("branchId","serviceId")
);

-- CreateIndex
CREATE INDEX "BranchServiceGst_serviceId_idx" ON "BranchServiceGst"("serviceId");

-- AddForeignKey
ALTER TABLE "BranchServiceGst" ADD CONSTRAINT "BranchServiceGst_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchServiceGst" ADD CONSTRAINT "BranchServiceGst_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Carry over what the branches already have: a service that was listed as "GST inside the price" becomes
-- INCLUDED_IN_PRICE, every other service of a branch that was customised becomes ADD_ON_TOP.
INSERT INTO "BranchServiceGst" ("branchId", "serviceId", "gstMode")
SELECT g."branchId", s."id",
       CASE WHEN s."id" = ANY (g."inclusiveServiceIds") THEN 'INCLUDED_IN_PRICE'::"GstMode" ELSE 'ADD_ON_TOP'::"GstMode" END
FROM "BranchGst" g CROSS JOIN "Service" s
ON CONFLICT DO NOTHING;

-- AlterTable
ALTER TABLE "BranchGst" DROP COLUMN "inclusiveServiceIds";

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "gstExemptServices" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "gstServicesExempt" DECIMAL(10,2) NOT NULL DEFAULT 0.00;
