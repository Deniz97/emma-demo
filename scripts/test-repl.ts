#!/usr/bin/env tsx
/**
 * Test script for ExecutionContext
 * Run with: npx tsx scripts/test-repl.ts
 */

import { config } from "dotenv";
import { ExecutionContext } from "@/lib/execution-context";

// Load environment variables
config();

console.log("🧪 Testing ExecutionContext\n");

async function runTest(testName: string, lines: string[]) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📋 Test: ${testName}`);
  console.log(`${"=".repeat(60)}\n`);

  console.log("📝 Code to execute:");
  lines.forEach((line, idx) => {
    console.log(`  ${idx + 1}: ${line}`);
  });
  console.log();

  const context = new ExecutionContext();

  try {
    console.log(`📦 Executing ${lines.length} line(s)\n`);

    const outputs = await context.executeLines(lines);

    console.log("✅ Execution completed successfully!\n");
    console.log("📤 Outputs:");
    outputs.forEach((output, idx) => {
      console.log(`\n--- Output ${idx + 1} ---`);
      console.log(output.formattedOutput);
      if (output.error) {
        console.log(`❌ Error: ${output.error}`);
      }
    });

    // Check if finish was called
    if (context.isFinishCalled()) {
      const result = context.getFinishResult();
      console.log(`\n🏁 finish() was called with ${result?.length || 0} slugs`);
      if (result && result.length > 0) {
        console.log(`   Slugs: ${result.join(", ")}`);
      }
    }

    console.log(
      `\n📊 META_TOOLS calls: ${context.getMetaToolsCallCount()}`
    );
  } catch (error) {
    console.error("❌ Execution failed:");
    console.error(error);
  } finally {
    context.cleanup();
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
