#!/usr/bin/env tsx

/**
 * Script to remove quotation marks from the beginning and end of all default prompts
 *
 * Usage:
 *   tsx scripts/clean-default-prompts-quotes.ts
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";

// Load environment variables
config();

/**
 * Removes surrounding quotation marks from a string
 */
function stripQuotes(text: string): string {
  let cleaned = text.trim();

  // Strip surrounding quotation marks (handles both single and double quotes, and backticks)
  // Also handles cases where there might be multiple layers of quotes
  while (
    cleaned &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")) ||
      (cleaned.startsWith("`") && cleaned.endsWith("`")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  return cleaned;
}

async function main() {
  console.log("\n🧹 Cleaning quotation marks from default prompts...\n");

  // Fetch all default prompts
  const prompts = await prisma.defaultPrompt.findMany({
    select: {
      id: true,
      prompt: true,
    },
  });

  console.log(`   Found ${prompts.length} prompts to check\n`);

  let updatedCount = 0;
  const updates: Array<{ id: string; old: string; new: string }> = [];

  // Process each prompt
  for (const prompt of prompts) {
    const cleaned = stripQuotes(prompt.prompt);

    // Only update if the prompt was actually changed
    if (cleaned !== prompt.prompt) {
      await prisma.defaultPrompt.update({
        where: { id: prompt.id },
        data: { prompt: cleaned },
      });

      updatedCount++;
      updates.push({
        id: prompt.id,
        old: prompt.prompt,
        new: cleaned,
      });

      console.log(`   ✓ Updated prompt ${prompt.id}`);
      console.log(`     Before: "${prompt.prompt}"`);
      console.log(`     After:  "${cleaned}"\n`);
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`✓ Total prompts checked: ${prompts.length}`);
  console.log(`✓ Updated: ${updatedCount}`);
  console.log(`✓ Unchanged: ${prompts.length - updatedCount}`);

  if (updates.length > 0) {
    console.log("\n📋 Updated Prompts:");
    console.log("-".repeat(60));
    updates.forEach((update, index) => {
      console.log(`\n${index + 1}. ID: ${update.id}`);
      console.log(`   Before: "${update.old}"`);
      console.log(`   After:  "${update.new}"`);
    });
  }

  console.log("\n" + "=".repeat(60));
  console.log("✅ Done!");
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
