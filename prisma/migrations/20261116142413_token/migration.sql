/*
  Warnings:

  - A unique constraint covering the columns `[id]` on the table `note` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "note_title_key";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "tokenLimit" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "tokenUsed" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "note_id_key" ON "note"("id");
