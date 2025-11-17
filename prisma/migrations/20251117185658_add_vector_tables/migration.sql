-- CreateTable
CREATE TABLE "app_data" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "nameVector" vector(1536) NOT NULL,
    "descriptionVector" vector(1536),
    "metadataKeys" TEXT[],
    "metadataValues" JSONB NOT NULL,
    "metadataVectors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_data" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "nameVector" vector(1536) NOT NULL,
    "descriptionVector" vector(1536),
    "metadataKeys" TEXT[],
    "metadataValues" JSONB NOT NULL,
    "metadataVectors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_data_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "method_data" (
    "id" TEXT NOT NULL,
    "methodId" TEXT NOT NULL,
    "nameVector" vector(1536) NOT NULL,
    "descriptionVector" vector(1536),
    "metadataKeys" TEXT[],
    "metadataValues" JSONB NOT NULL,
    "metadataVectors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "method_data_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_data_appId_key" ON "app_data"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "class_data_classId_key" ON "class_data"("classId");

-- CreateIndex
CREATE UNIQUE INDEX "method_data_methodId_key" ON "method_data"("methodId");

-- AddForeignKey
ALTER TABLE "app_data" ADD CONSTRAINT "app_data_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_data" ADD CONSTRAINT "class_data_classId_fkey" FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "method_data" ADD CONSTRAINT "method_data_methodId_fkey" FOREIGN KEY ("methodId") REFERENCES "methods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create vector indexes for similarity search
CREATE INDEX "app_data_nameVector_idx" ON "app_data" USING hnsw ("nameVector" vector_cosine_ops);
CREATE INDEX "app_data_descriptionVector_idx" ON "app_data" USING hnsw ("descriptionVector" vector_cosine_ops) WHERE "descriptionVector" IS NOT NULL;

CREATE INDEX "class_data_nameVector_idx" ON "class_data" USING hnsw ("nameVector" vector_cosine_ops);
CREATE INDEX "class_data_descriptionVector_idx" ON "class_data" USING hnsw ("descriptionVector" vector_cosine_ops) WHERE "descriptionVector" IS NOT NULL;

CREATE INDEX "method_data_nameVector_idx" ON "method_data" USING hnsw ("nameVector" vector_cosine_ops);
CREATE INDEX "method_data_descriptionVector_idx" ON "method_data" USING hnsw ("descriptionVector" vector_cosine_ops) WHERE "descriptionVector" IS NOT NULL;
