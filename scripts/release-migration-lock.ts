#!/usr/bin/env tsx

/**
 * Script to release stuck Prisma migration advisory locks
 * 
 * Usage:
 *   tsx scripts/release-migration-lock.ts
 */

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Load environment variables
config();

const prisma = new PrismaClient();

async function releaseLocks() {
  try {
    console.log("Checking for advisory locks...");

    // Prisma uses advisory lock ID 72707369 for migrations
    // Check if the lock is held
    const lockCheck = await prisma.$queryRaw<Array<{ granted: boolean; pid: number | null }>>`
      SELECT 
        CASE WHEN pg_try_advisory_lock(72707369) THEN true ELSE false END as granted,
        (SELECT pid FROM pg_locks WHERE locktype = 'advisory' AND objid = 72707369 LIMIT 1) as pid
    `;

    const isLocked = !lockCheck[0]?.granted;
    const pid = lockCheck[0]?.pid;

    if (isLocked && pid) {
      console.log(`Lock is held by process ${pid}`);
      console.log("Attempting to release lock...");

      // Try to release the lock
      await prisma.$executeRawUnsafe(`
        SELECT pg_advisory_unlock_all();
      `);

      // Also try to terminate the process if it's still running
      try {
        await prisma.$executeRawUnsafe(`
          SELECT pg_terminate_backend(${pid});
        `);
        console.log(`Terminated process ${pid}`);
      } catch (error) {
        console.log(`Could not terminate process ${pid} (may have already ended)`);
      }

      console.log("✓ Lock released");
    } else if (isLocked) {
      console.log("Lock appears to be held but no process found");
      console.log("Attempting to release all advisory locks...");
      await prisma.$executeRawUnsafe(`
        SELECT pg_advisory_unlock_all();
      `);
      console.log("✓ Attempted to release all locks");
    } else {
      console.log("✓ No lock found - database is ready for migrations");
    }

    // Verify lock is released
    const verifyLock = await prisma.$queryRaw<Array<{ granted: boolean }>>`
      SELECT pg_try_advisory_lock(72707369) as granted
    `;

    if (verifyLock[0]?.granted) {
      // Release it immediately since we just acquired it for testing
      await prisma.$executeRawUnsafe(`
        SELECT pg_advisory_unlock(72707369);
      `);
      console.log("✓ Verified: Lock can be acquired (released immediately)");
    }
  } catch (error) {
    console.error("Error releasing locks:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

releaseLocks()
  .then(() => {
    console.log("\n✓ Done! You can now try running migrations again.");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

