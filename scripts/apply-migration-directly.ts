#!/usr/bin/env tsx

/**
 * Script to apply migration directly via Prisma client to bypass lock issues
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { readFileSync } from "fs";
import { join } from "path";

// Load environment variables
config();

async function applyMigration() {
  const migrationPath = join(
    __dirname,
    "../prisma/migrations/20251117185658_add_vector_tables/migration.sql"
  );

  console.log("Reading migration file...");
  const migrationSQL = readFileSync(migrationPath, "utf-8");

  console.log("Applying migration directly...");

  // Split by semicolons and execute each statement
  const statements = migrationSQL
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !s.startsWith("--"));

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        console.log(`Executing: ${statement.substring(0, 50)}...`);
        await prisma.$executeRawUnsafe(statement);
      } catch (error: unknown) {
        // Ignore "already exists" errors
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        if (
          errorMessage.includes("already exists") ||
          errorMessage.includes("duplicate")
        ) {
          console.log(`  ⚠ Skipped (already exists)`);
        } else {
          console.error(`  ✗ Error: ${errorMessage}`);
          throw error;
        }
      }
    }
  }

  // Mark migration as applied in _prisma_migrations table
  console.log("Marking migration as applied...");
  await prisma.$executeRawUnsafe(`
    INSERT INTO "_prisma_migrations" (id, checksum, finished_at, migration_name, logs, started_at, applied_steps_count)
    VALUES (
      gen_random_uuid()::text,
      '',
      NOW(),
      '20251117185658_add_vector_tables',
      NULL,
      NOW(),
      1
    )
    ON CONFLICT DO NOTHING
  `);

  console.log("✓ Migration applied successfully!");
}

applyMigration()
  .then(() => {
    console.log("✓ Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
