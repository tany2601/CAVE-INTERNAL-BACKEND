-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "gstInclusiveServices" TEXT[] DEFAULT ARRAY[]::TEXT[];
