-- CreateEnum
CREATE TYPE "CommissionModel" AS ENUM ('FLAT_PERCENTAGE', 'DAILY_TARGET', 'MONTHLY_TARGET');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('GENERAL_EXPENSE', 'EMPLOYEE_ADVANCE');

-- CreateEnum
CREATE TYPE "PaymentMode" AS ENUM ('CASH', 'GPAY');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PERCENTAGE', 'FIXED');

-- DropIndex
DROP INDEX "Branch_loginPinLookup_key";

-- AlterTable
ALTER TABLE "Branch" DROP COLUMN "loginPinHash",
DROP COLUMN "loginPinLookup";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "commissionModel" "CommissionModel",
ADD COLUMN     "dailyTargetAmount" DECIMAL(10,2),
ADD COLUMN     "flatCommissionPercentage" DECIMAL(5,2),
ADD COLUMN     "monthlySalary" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "durationMin" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchServicePricing" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchServicePricing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchRoleCredential" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "pinLookup" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchRoleCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffCommissionSlab" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slabOrder" INTEGER NOT NULL,
    "minRevenue" DECIMAL(10,2) NOT NULL,
    "commissionPercentage" DECIMAL(5,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffCommissionSlab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchTransaction" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL,
    "employeeId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "qualifyingCompletedSessionsCount" INTEGER NOT NULL DEFAULT 0,
    "rewardEarned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "stylistId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerMobile" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "tipAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "totalAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "paymentMode" "PaymentMode",
    "startedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "isLoyaltyCounted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionService" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "servicePricingId" TEXT,
    "serviceName" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "isCustom" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionProduct" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "paymentMode" "PaymentMode" NOT NULL DEFAULT 'CASH',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SessionProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Service_name_key" ON "Service"("name");

-- CreateIndex
CREATE INDEX "BranchServicePricing_branchId_idx" ON "BranchServicePricing"("branchId");

-- CreateIndex
CREATE INDEX "BranchServicePricing_serviceId_idx" ON "BranchServicePricing"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchServicePricing_branchId_serviceId_key" ON "BranchServicePricing"("branchId", "serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchRoleCredential_pinLookup_key" ON "BranchRoleCredential"("pinLookup");

-- CreateIndex
CREATE INDEX "BranchRoleCredential_branchId_idx" ON "BranchRoleCredential"("branchId");

-- CreateIndex
CREATE INDEX "BranchRoleCredential_roleId_idx" ON "BranchRoleCredential"("roleId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchRoleCredential_branchId_roleId_key" ON "BranchRoleCredential"("branchId", "roleId");

-- CreateIndex
CREATE INDEX "StaffCommissionSlab_userId_idx" ON "StaffCommissionSlab"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "StaffCommissionSlab_userId_slabOrder_key" ON "StaffCommissionSlab"("userId", "slabOrder");

-- CreateIndex
CREATE INDEX "BranchTransaction_branchId_idx" ON "BranchTransaction"("branchId");

-- CreateIndex
CREATE INDEX "BranchTransaction_type_idx" ON "BranchTransaction"("type");

-- CreateIndex
CREATE INDEX "BranchTransaction_createdAt_idx" ON "BranchTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "BranchTransaction_employeeId_idx" ON "BranchTransaction"("employeeId");

-- CreateIndex
CREATE INDEX "BranchTransaction_createdById_idx" ON "BranchTransaction"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_phone_key" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Session_branchId_idx" ON "Session"("branchId");

-- CreateIndex
CREATE INDEX "Session_stylistId_idx" ON "Session"("stylistId");

-- CreateIndex
CREATE INDEX "Session_customerId_idx" ON "Session"("customerId");

-- CreateIndex
CREATE INDEX "Session_status_idx" ON "Session"("status");

-- CreateIndex
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");

-- CreateIndex
CREATE INDEX "SessionService_sessionId_idx" ON "SessionService"("sessionId");

-- CreateIndex
CREATE INDEX "SessionService_servicePricingId_idx" ON "SessionService"("servicePricingId");

-- CreateIndex
CREATE INDEX "SessionProduct_sessionId_idx" ON "SessionProduct"("sessionId");

-- AddForeignKey
ALTER TABLE "BranchServicePricing" ADD CONSTRAINT "BranchServicePricing_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchServicePricing" ADD CONSTRAINT "BranchServicePricing_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchRoleCredential" ADD CONSTRAINT "BranchRoleCredential_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchRoleCredential" ADD CONSTRAINT "BranchRoleCredential_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StaffCommissionSlab" ADD CONSTRAINT "StaffCommissionSlab_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransaction" ADD CONSTRAINT "BranchTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransaction" ADD CONSTRAINT "BranchTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchTransaction" ADD CONSTRAINT "BranchTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_stylistId_fkey" FOREIGN KEY ("stylistId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionService" ADD CONSTRAINT "SessionService_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionService" ADD CONSTRAINT "SessionService_servicePricingId_fkey" FOREIGN KEY ("servicePricingId") REFERENCES "BranchServicePricing"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionProduct" ADD CONSTRAINT "SessionProduct_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

