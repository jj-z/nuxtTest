/*
  Warnings:

  - You are about to alter the column `name` on the `ReadingNote` table. The data in that column could be lost. The data in that column will be cast from `Text` to `VarChar(20)`.
  - Added the required column `dateM` to the `Expense` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dateY` to the `Expense` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "dateM" TEXT NOT NULL,
ADD COLUMN     "dateY" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ReadingNote" ALTER COLUMN "name" SET DATA TYPE VARCHAR(20);
