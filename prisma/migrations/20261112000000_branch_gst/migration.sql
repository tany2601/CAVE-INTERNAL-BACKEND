-- CreateTable
CREATE TABLE "BranchGst" (
    "branchId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "servicesRate" DECIMAL(5,2) NOT NULL DEFAULT 5.00,
    "productsRate" DECIMAL(5,2) NOT NULL DEFAULT 18.00,
    "productsInclusive" BOOLEAN NOT NULL DEFAULT false,
    "inclusiveServiceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchGst_pkey" PRIMARY KEY ("branchId")
);

-- AddForeignKey
ALTER TABLE "BranchGst" ADD CONSTRAINT "BranchGst_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
