-- CreateTable if it doesn't exist
CREATE TABLE IF NOT EXISTS "default_prompts" (
    "id" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "classIds" TEXT[] NOT NULL,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "default_prompts_pkey" PRIMARY KEY ("id")
);

-- Add icon column if table exists but column doesn't
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'default_prompts') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'default_prompts' AND column_name = 'icon') THEN
            ALTER TABLE "default_prompts" ADD COLUMN "icon" TEXT;
        END IF;
    END IF;
END $$;

