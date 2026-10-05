-- CreateEnum
CREATE TYPE "PayoutKind" AS ENUM ('COMMISSION', 'TIP_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "SalaryVia" AS ENUM ('CASH', 'GPAY', 'BANK_TRANSFER');

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "imageUrl" TEXT,
ADD COLUMN     "managerId" TEXT,
ADD COLUMN     "monthlyTarget" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "editedAt" TIMESTAMP(3),
ADD COLUMN     "isEdited" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dailyRevenueTarget" DECIMAL(10,2),
ADD COLUMN     "monthlyRevenueTarget" DECIMAL(12,2),
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "photoUrl" TEXT;

-- CreateTable
CREATE TABLE "DailyBalance" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openingCash" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "openingGpay" DECIMAL(12,2) NOT NULL DEFAULT 0.00,
    "openingSetAt" TIMESTAMP(3),
    "expectedCash" DECIMAL(12,2),
    "expectedGpay" DECIMAL(12,2),
    "closingCash" DECIMAL(12,2),
    "closingGpay" DECIMAL(12,2),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffPayout" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "PayoutKind" NOT NULL DEFAULT 'COMMISSION',
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "forDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StaffPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalaryPayment" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "userId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "via" "SalaryVia" NOT NULL DEFAULT 'GPAY',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistTask" (
    "id" TEXT NOT NULL,
    "branchId" TEXT,
    "task" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistCompletion" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChecklistCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyBalance_branchId_idx" ON "DailyBalance"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBalance_branchId_date_key" ON "DailyBalance"("branchId", "date");

-- CreateIndex
CREATE INDEX "StaffPayout_branchId_forDate_idx" ON "StaffPayout"("branchId", "forDate");

-- CreateIndex
CREATE INDEX "StaffPayout_userId_idx" ON "StaffPayout"("userId");

-- CreateIndex
CREATE INDEX "SalaryPayment_userId_idx" ON "SalaryPayment"("userId");

-- CreateIndex
CREATE INDEX "SalaryPayment_createdAt_idx" ON "SalaryPayment"("createdAt");

-- CreateIndex
CREATE INDEX "ChecklistTask_branchId_idx" ON "ChecklistTask"("branchId");

-- CreateIndex
CREATE INDEX "ChecklistCompletion_branchId_date_idx" ON "ChecklistCompletion"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ChecklistCompletion_taskId_branchId_date_key" ON "ChecklistCompletion"("taskId", "branchId", "date");

-- CreateIndex
CREATE INDEX "Branch_managerId_idx" ON "Branch"("managerId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyBalance" ADD CONSTRAINT "DailyBalance_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayout" ADD CONSTRAINT "StaffPayout_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffPayout" ADD CONSTRAINT "StaffPayout_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistCompletion" ADD CONSTRAINT "ChecklistCompletion_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ChecklistTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistCompletion" ADD CONSTRAINT "ChecklistCompletion_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

