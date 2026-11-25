CREATE EXTENSION IF NOT EXISTS vector;
-- AlterTable
ALTER TABLE "note" ADD COLUMN     "embedding" vector(2048);
