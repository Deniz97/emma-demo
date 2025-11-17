#!/usr/bin/env tsx

/**
 * Script to populate vector data for Apps, Classes, and Methods
 * 
 * Usage:
 *   tsx scripts/populate-vectors.ts --all
 *   tsx scripts/populate-vectors.ts --app-id <id>
 *   tsx scripts/populate-vectors.ts --class-id <id>
 *   tsx scripts/populate-vectors.ts --method-id <id>
 */

import { config } from "dotenv";
import {
  populateAppData,
  populateClassData,
  populateMethodData,
  populateAllVectors,
} from "../lib/vector-service";

// Load environment variables
config();

async function main() {
  const args = process.argv.slice(2);

  // Check for --limit argument
  let totalLimit: number | undefined;
  if (args.includes("--limit")) {
    const limitIndex = args.indexOf("--limit");
    const limitValue = args[limitIndex + 1];
    if (!limitValue || isNaN(parseInt(limitValue))) {
      console.error("Error: --limit requires a valid number");
      process.exit(1);
    }
    totalLimit = parseInt(limitValue);
  }

  if (args.includes("--all")) {
    console.log("Populating vectors for all entities (skipping those with existing vectors)...");
    await populateAllVectors(totalLimit);
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--app-id")) {
    const index = args.indexOf("--app-id");
    const appId = args[index + 1];
    if (!appId) {
      console.error("Error: --app-id requires an app ID");
      process.exit(1);
    }
    console.log(`Populating vectors for app: ${appId}`);
    await populateAppData(appId);
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--class-id")) {
    const index = args.indexOf("--class-id");
    const classId = args[index + 1];
    if (!classId) {
      console.error("Error: --class-id requires a class ID");
      process.exit(1);
    }
    console.log(`Populating vectors for class: ${classId}`);
    await populateClassData(classId);
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--method-id")) {
    const index = args.indexOf("--method-id");
    const methodId = args[index + 1];
    if (!methodId) {
      console.error("Error: --method-id requires a method ID");
      process.exit(1);
    }
    console.log(`Populating vectors for method: ${methodId}`);
    await populateMethodData(methodId);
    console.log("✓ Done!");
    process.exit(0);
  }

  console.log(`
Usage:
  tsx scripts/populate-vectors.ts --all [--limit <number>]
  tsx scripts/populate-vectors.ts --app-id <id>
  tsx scripts/populate-vectors.ts --class-id <id>
  tsx scripts/populate-vectors.ts --method-id <id>
  
Options:
  --limit <number>  Total limit of entities to process across all types (only works with --all)
                    Script only processes entities that don't already have vectors
  `);
  process.exit(1);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

