/*
  Warnings:

  - You are about to drop the column `dateM` on the `Expense` table. All the data in the column will be lost.
  - You are about to drop the column `dateY` on the `Expense` table. All the data in the column will be lost.
  - Added the required column `month` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `year` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" DROP COLUMN "dateM",
DROP COLUMN "dateY",
ADD COLUMN     "month" TEXT NOT NULL,
ADD COLUMN     "year" TEXT NOT NULL;
