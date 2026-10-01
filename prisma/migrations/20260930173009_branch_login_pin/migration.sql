/*
  Warnings:

  - You are about to drop the column `pinHash` on the `User` table. All the data in the column will be lost.
  - Added the required column `loginPinHash` to the `Branch` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "loginPinHash" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "pinHash";
