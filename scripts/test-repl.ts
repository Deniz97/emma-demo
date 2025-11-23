#!/usr/bin/env tsx
/**
 * Test script for REPL execution
 * Run with: npx tsx scripts/test-repl.ts
 */

import { config } from "dotenv";
import { createReplSession } from "@/lib/repl/tools";

// Load environment variables
config();

console.log("🧪 Testing REPL Execution\n");

async function runTest(testName: string, lines: string[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 Test: ${testName}`);
  console.log(`${"=".repeat(60)}\n`);

  console.log("📝 Code to execute:");
  lines.forEach((line, idx) => {
    console.log(`  ${idx + 1}: ${line}`);
  });
  console.log();

  const session = createReplSession();

  try {
    console.log(`📦 Combined code (${lines.length} lines):`);
    console.log("---");
    console.log(lines.join("\n"));
    console.log("---\n");

    const outputs = await session.runLines(lines);

    console.log("✅ Execution completed successfully!\n");
    console.log("📤 Outputs:");
    outputs.forEach((output, idx) => {
      console.log(`\n--- Output ${idx + 1} ---`);
      console.log(output.formattedOutput);
    });
  } catch (error) {
    console.error("❌ Execution failed:");
    console.error(error);
  } finally {
    session.cleanup();
  }
}

async function main() {
  try {
    // Test 1: Simple multi-line with var
    await runTest("Simple multi-line with var", [
      'var methods = await get_methods({ categories: ["defi-analytics","market-data-aggregators"], search_queries: ["smart money NFT trends", "DeFi TVL this month"], top: 3, threshold: 0.4 });',
      "await finish(methods.map(m => m.slug));",
    ]);

    // Test 2: Multi-step exploration
    await runTest("Multi-step exploration", [
      'var apps = await get_apps({ categories: ["on-chain-analytics"], search_queries: ["whale activity", "large transfers"], top: 3 });',
      'console.log("Found apps:", apps.length, apps.map(a => a.slug));',
      'var methods = await get_methods({ apps: apps.map(a => a.slug), search_queries: ["BTC whale movements"], top: 2 });',
      "await finish(methods.map(m => m.slug));",
    ]);

    console.log("\n\n✅ All tests completed!");
  } catch (error) {
    console.error("\n\n❌ Tests failed:", error);
    process.exit(1);
  }
}

main();
