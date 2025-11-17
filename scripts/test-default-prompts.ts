#!/usr/bin/env tsx

/**
 * Script to test default prompts against the tool selector
 * 
 * Usage:
 *   tsx scripts/test-default-prompts.ts              # Test all default prompts
 *   tsx scripts/test-default-prompts.ts --prompt-id <id>  # Test specific prompt
 * 
 * This script:
 * - Loads default prompts from the database
 * - Calls selectTools() for each prompt
 * - Validates that:
 *   - All returned tools belong to the expected classes
 *   - At least one method from each expected class is returned
 * - Prints detailed results and summary
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { selectTools } from "../lib/tool-selector";
import { Method } from "@/types/tool";

// Load environment variables
config();

interface TestResult {
  promptId: string;
  prompt: string;
  expectedClassIds: string[];
  expectedClassNames: string[];
  returnedToolCount: number;
  returnedToolsByClass: Map<string, string[]>;
  allToolsFromExpectedClasses: boolean;
  allExpectedClassesRepresented: boolean;
  passed: boolean;
  error?: string;
}

/**
 * Tests a single default prompt
 */
async function testPrompt(
  promptId: string,
  promptText: string,
  expectedClassIds: string[]
): Promise<TestResult> {
  const result: TestResult = {
    promptId,
    prompt: promptText,
    expectedClassIds,
    expectedClassNames: [],
    returnedToolCount: 0,
    returnedToolsByClass: new Map(),
    allToolsFromExpectedClasses: false,
    allExpectedClassesRepresented: false,
    passed: false,
  };

  try {
    // Fetch expected class information
    const expectedClasses = await prisma.class.findMany({
      where: {
        id: {
          in: expectedClassIds,
        },
      },
      select: {
        id: true,
        name: true,
      },
    });

    const classIdToName = new Map<string, string>();
    expectedClasses.forEach((cls) => {
      classIdToName.set(cls.id, cls.name);
    });

    result.expectedClassNames = expectedClasses.map((cls) => cls.name);

    // Call selectTools
    console.log(`\n📞 Calling selectTools()...`);
    const toolSelectorResult = await selectTools(promptText, []);
    const returnedMethods =
      toolSelectorResult.tools.length > 0 &&
      typeof toolSelectorResult.tools[0] !== "string"
        ? (toolSelectorResult.tools as Method[])
        : [];

    result.returnedToolCount = returnedMethods.length;

    // Group returned methods by class
    for (const method of returnedMethods) {
      const className = classIdToName.get(method.classId) || "Unknown";
      if (!result.returnedToolsByClass.has(method.classId)) {
        result.returnedToolsByClass.set(method.classId, []);
      }
      result.returnedToolsByClass.get(method.classId)?.push(method.name);
    }

    // Validation 1: All returned tools belong to expected classes
    const allFromExpectedClasses = returnedMethods.every((method) =>
      expectedClassIds.includes(method.classId)
    );
    result.allToolsFromExpectedClasses = allFromExpectedClasses;

    // Validation 2: At least one method from each expected class
    const representedClassIds = new Set(returnedMethods.map((m) => m.classId));
    const allClassesRepresented = expectedClassIds.every((classId) =>
      representedClassIds.has(classId)
    );
    result.allExpectedClassesRepresented = allClassesRepresented;

    // Overall pass/fail
    result.passed =
      allFromExpectedClasses && allClassesRepresented && returnedMethods.length > 0;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
  }

  return result;
}

/**
 * Prints the test result in a formatted way
 */
function printTestResult(result: TestResult, index: number, total: number) {
  console.log("\n" + "=".repeat(70));
  console.log(`📋 Test ${index + 1}/${total} - Prompt ID: ${result.promptId}`);
  console.log("=".repeat(70));
  
  console.log(`\n💬 Prompt:\n   "${result.prompt}"\n`);
  
  console.log(`📚 Expected Classes (${result.expectedClassNames.length}):`);
  result.expectedClassNames.forEach((name) => {
    console.log(`   - ${name}`);
  });

  if (result.error) {
    console.log(`\n❌ ERROR: ${result.error}`);
    return;
  }

  console.log(`\n🔧 Returned Tools: ${result.returnedToolCount} methods\n`);

  if (result.returnedToolCount === 0) {
    console.log("   ⚠️  No tools returned!");
  } else {
    console.log("   Methods by Class:");
    for (const expectedClassId of result.expectedClassIds) {
      const methods = result.returnedToolsByClass.get(expectedClassId) || [];
      const className = result.expectedClassNames[result.expectedClassIds.indexOf(expectedClassId)];
      
      if (methods.length > 0) {
        console.log(`   ✓ ${className}: ${methods.length} method(s)`);
        methods.forEach((methodName) => {
          console.log(`      - ${methodName}`);
        });
      } else {
        console.log(`   ✗ ${className}: 0 methods (MISSING)`);
      }
    }

    // Check for unexpected classes
    const unexpectedClasses: string[] = [];
    for (const [classId, methods] of result.returnedToolsByClass.entries()) {
      if (!result.expectedClassIds.includes(classId)) {
        unexpectedClasses.push(`${classId} (${methods.length} methods)`);
      }
    }

    if (unexpectedClasses.length > 0) {
      console.log(`\n   ⚠️  Unexpected Classes:`);
      unexpectedClasses.forEach((cls) => {
        console.log(`      - ${cls}`);
      });
    }
  }

  console.log(`\n📊 Validation:`);
  console.log(
    `   ${result.allToolsFromExpectedClasses ? "✓" : "✗"} All tools from expected classes: ${result.allToolsFromExpectedClasses}`
  );
  console.log(
    `   ${result.allExpectedClassesRepresented ? "✓" : "✗"} All expected classes represented: ${result.allExpectedClassesRepresented}`
  );
  console.log(
    `   ${result.returnedToolCount > 0 ? "✓" : "✗"} At least one tool returned: ${result.returnedToolCount > 0}`
  );

  console.log(`\n${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
}

/**
 * Prints the summary of all test results
 */
function printSummary(results: TestResult[]) {
  console.log("\n\n" + "=".repeat(70));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const errors = results.filter((r) => r.error).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed} (${((passed / results.length) * 100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${((failed / results.length) * 100).toFixed(1)}%)`);
  if (errors > 0) {
    console.log(`⚠️  Errors: ${errors}`);
  }

  if (failed > 0) {
    console.log(`\n❌ Failed Tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r, index) => {
        console.log(`   ${index + 1}. Prompt ID: ${r.promptId}`);
        console.log(`      "${r.prompt.substring(0, 80)}${r.prompt.length > 80 ? "..." : ""}"`);
        if (r.error) {
          console.log(`      Error: ${r.error}`);
        } else {
          if (!r.allToolsFromExpectedClasses) {
            console.log(`      Issue: Some tools from unexpected classes`);
          }
          if (!r.allExpectedClassesRepresented) {
            console.log(`      Issue: Not all expected classes represented`);
          }
          if (r.returnedToolCount === 0) {
            console.log(`      Issue: No tools returned`);
          }
        }
      });
  }

  console.log("\n" + "=".repeat(70));
}

async function main() {
  const args = process.argv.slice(2);

  // Parse --prompt-id argument
  let promptId: string | null = null;
  if (args.includes("--prompt-id")) {
    const promptIdIndex = args.indexOf("--prompt-id");
    promptId = args[promptIdIndex + 1];
    if (!promptId) {
      console.error("Error: --prompt-id requires a prompt ID");
      process.exit(1);
    }
  }

  console.log("\n🧪 Default Prompts Test Suite");
  console.log("=".repeat(70));

  // Fetch prompts to test
  const prompts = await prisma.defaultPrompt.findMany({
    where: promptId ? { id: promptId } : undefined,
    orderBy: {
      createdAt: "desc",
    },
  });

  if (prompts.length === 0) {
    if (promptId) {
      console.error(`\n❌ Error: No prompt found with ID: ${promptId}`);
    } else {
      console.error(`\n❌ Error: No default prompts found in database.`);
      console.log(`   Run: tsx scripts/generate-default-prompts.ts --limit 10`);
    }
    process.exit(1);
  }

  console.log(`\n📝 Testing ${prompts.length} prompt(s)...\n`);

  const results: TestResult[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const prompt = prompts[i];
    console.log(`\n🔍 Testing prompt ${i + 1}/${prompts.length}...`);
    const result = await testPrompt(prompt.id, prompt.prompt, prompt.classIds);
    results.push(result);
    printTestResult(result, i, prompts.length);
  }

  printSummary(results);

  // Exit with appropriate code
  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

