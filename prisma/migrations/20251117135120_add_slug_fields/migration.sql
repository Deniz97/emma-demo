-- AlterTable
ALTER TABLE "apps" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "classes" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "methods" ADD COLUMN "slug" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "apps_slug_key" ON "apps"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "classes_slug_key" ON "classes"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "methods_slug_key" ON "methods"("slug");

