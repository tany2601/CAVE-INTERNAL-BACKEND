-- AlterTable
ALTER TABLE "Branch" ADD COLUMN "loginPinLookup" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_loginPinLookup_key" ON "Branch"("loginPinLookup");
