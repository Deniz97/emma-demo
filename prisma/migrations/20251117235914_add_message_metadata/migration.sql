-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- CreateIndex (if not exists) for vector columns
CREATE INDEX IF NOT EXISTS "app_data_nameVector_idx" ON "app_data" USING hnsw ("nameVector" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "class_data_nameVector_idx" ON "class_data" USING hnsw ("nameVector" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "method_data_nameVector_idx" ON "method_data" USING hnsw ("nameVector" vector_cosine_ops);

