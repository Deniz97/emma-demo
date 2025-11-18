#!/usr/bin/env tsx

/**
 * Script to test default prompts against the tool selector
 * 
 * Usage:
 *   tsx scripts/test-default-prompts.ts                        # Test all default prompts
 *   tsx scripts/test-default-prompts.ts --limit 10             # Test first 10 prompts
 *   tsx scripts/test-default-prompts.ts --prompt-id <id>       # Test specific prompt
 *   tsx scripts/test-default-prompts.ts --csv                  # Export CSV with timestamp
 *   tsx scripts/test-default-prompts.ts --limit 5 --csv        # Test 5 prompts and export CSV
 * 
 * Makefile Commands:
 *   make test-prompts                                           # Test all prompts
 *   make test-prompts limit=10                                  # Test 10 prompts
 *   make test-prompts limit=5 csv=yes                           # Test 5 with CSV export
 *   make test-prompts csv=yes csvfile=custom.csv                # Custom CSV filename
 * 
 * Output:
 * - Always creates: test-results/summary_TIMESTAMP.txt (aggregate metrics)
 * - With --csv: test-results/results_TIMESTAMP.csv (detailed per-test data)
 * - Files saved in test-results/ subfolder with ISO timestamps
 * 
 * This script:
 * - Loads default prompts from the database
 * - Calls selectTools() for each prompt
 * - Validates that:
 *   - All returned tools belong to the expected classes
 *   - At least one method from each expected class is returned
 * - Calculates accuracy metrics (based on max 10 tools):
 *   - True Positives, False Positives, False Negatives, True Negatives
 *   - Precision, Recall, F1 Score
 *   - False Positive Rate, False Negative Rate
 *   - Equal Error Rate (EER)
 * - Displays App → Class pairs for expected tools
 * - Displays App → Class → Method for returned tools
 * - Prints detailed results and summary with aggregate metrics
 * - Exports timestamped summary TXT (always) and CSV (optional) to test-results/
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { selectTools } from "../lib/tool-selector";
import { Method } from "@/types/tool";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
config();

interface TestResult {
  promptId: string;
  prompt: string;
  expectedClassIds: string[];
  expectedClassNames: string[];
  expectedAppClassPairs: Array<{ app: string; class: string }>;
  returnedToolCount: number;
  returnedToolsByClass: Map<string, string[]>;
  returnedToolsDetails: Array<{ app: string; class: string; method: string }>;
  allToolsFromExpectedClasses: boolean;
  allExpectedClassesRepresented: boolean;
  passed: boolean;
  error?: string;
  // Accuracy metrics
  truePositives: number;    // Methods from expected classes that were returned
  falsePositives: number;   // Methods returned that are NOT from expected classes
  falseNegatives: number;   // Methods from expected classes that were NOT returned
  trueNegatives: number;    // Available slots in max 10 selection (10 - TP - FP)
  precision: number;        // TP / (TP + FP) - accuracy of returned tools
  recall: number;           // TP / (TP + FN) - coverage of expected tools
  f1Score: number;          // 2 * (precision * recall) / (precision + recall)
  falsePositiveRate: number;  // FP / (FP + TN)
  falseNegativeRate: number;  // FN / (TP + FN)
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
    expectedAppClassPairs: [],
    returnedToolCount: 0,
    returnedToolsByClass: new Map(),
    returnedToolsDetails: [],
    allToolsFromExpectedClasses: false,
    allExpectedClassesRepresented: false,
    passed: false,
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    trueNegatives: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
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

    // Fetch expected classes with app information for display
    const expectedClassesWithApps = await prisma.class.findMany({
      where: {
        id: {
          in: expectedClassIds,
        },
      },
      include: {
        app: {
          select: {
            name: true,
          },
        },
      },
    });

    // Populate app,class pairs for expected classes
    result.expectedAppClassPairs = expectedClassesWithApps.map((cls) => ({
      app: cls.app.name,
      class: cls.name,
    }));

    // Fetch all methods from expected classes (for FN calculation)
    const allExpectedMethods = await prisma.method.findMany({
      where: {
        classId: {
          in: expectedClassIds,
        },
      },
      select: {
        id: true,
        classId: true,
        name: true,
      },
    });

    // Call selectTools
    console.log(`\n📞 Calling selectTools()...`);
    const toolSelectorResult = await selectTools(promptText, []);
    const returnedMethods =
      toolSelectorResult.tools.length > 0 &&
      typeof toolSelectorResult.tools[0] !== "string"
        ? (toolSelectorResult.tools as Method[])
        : [];

    result.returnedToolCount = returnedMethods.length;

    // Fetch class and app information for returned methods
    const returnedMethodClassIds = [...new Set(returnedMethods.map((m) => m.classId))];
    const returnedClasses = await prisma.class.findMany({
      where: {
        id: {
          in: returnedMethodClassIds,
        },
      },
      include: {
        app: {
          select: {
            name: true,
          },
        },
      },
    });

    const classIdToInfo = new Map<string, { className: string; appName: string }>();
    returnedClasses.forEach((cls) => {
      classIdToInfo.set(cls.id, {
        className: cls.name,
        appName: cls.app.name,
      });
    });

    // Group returned methods by class and collect details
    for (const method of returnedMethods) {
      const classInfo = classIdToInfo.get(method.classId);
      const className = classInfo?.className || classIdToName.get(method.classId) || "Unknown";
      const appName = classInfo?.appName || "Unknown App";

      if (!result.returnedToolsByClass.has(method.classId)) {
        result.returnedToolsByClass.set(method.classId, []);
      }
      result.returnedToolsByClass.get(method.classId)?.push(method.name);

      // Add app,class,method details
      result.returnedToolsDetails.push({
        app: appName,
        class: className,
        method: method.name,
      });
    }

    // Calculate accuracy metrics
    const returnedMethodIds = new Set(returnedMethods.map((m) => m.id));
    const expectedMethodIds = new Set(allExpectedMethods.map((m) => m.id));

    // True Positives: Returned methods that are from expected classes
    result.truePositives = returnedMethods.filter((m) =>
      expectedClassIds.includes(m.classId)
    ).length;

    // False Positives: Returned methods that are NOT from expected classes
    result.falsePositives = returnedMethods.filter(
      (m) => !expectedClassIds.includes(m.classId)
    ).length;

    // False Negatives: Expected methods that were NOT returned
    result.falseNegatives = allExpectedMethods.filter(
      (m) => !returnedMethodIds.has(m.id)
    ).length;

    // True Negatives: Available slots in the max 10 selection space that weren't used
    // Since the tool selector can return max 10 tools:
    // - Selection space = 10
    // - Used slots = TP + FP (total returned)
    // - Available slots (TN) = 10 - TP - FP (these are correctly not filled with wrong tools)
    const MAX_TOOLS = 10;
    result.trueNegatives = MAX_TOOLS - result.truePositives - result.falsePositives;

    // Calculate derived metrics
    const tp = result.truePositives;
    const fp = result.falsePositives;
    const fn = result.falseNegatives;
    const tn = result.trueNegatives;

    // Precision: TP / (TP + FP) - accuracy of returned tools
    result.precision = tp + fp > 0 ? tp / (tp + fp) : 0;

    // Recall: TP / (TP + FN) - coverage of expected tools
    result.recall = tp + fn > 0 ? tp / (tp + fn) : 0;

    // F1 Score: harmonic mean of precision and recall
    result.f1Score =
      result.precision + result.recall > 0
        ? (2 * result.precision * result.recall) / (result.precision + result.recall)
        : 0;

    // False Positive Rate: FP / (FP + TN)
    result.falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;

    // False Negative Rate: FN / (TP + FN) = 1 - Recall
    result.falseNegativeRate = tp + fn > 0 ? fn / (tp + fn) : 0;

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
  
  console.log(`📚 Expected (App → Class) [${result.expectedAppClassPairs.length}]:`);
  result.expectedAppClassPairs.forEach((pair) => {
    console.log(`   • ${pair.app} → ${pair.class}`);
  });

  if (result.error) {
    console.log(`\n❌ ERROR: ${result.error}`);
    return;
  }

  console.log(`\n🔧 Returned (App → Class → Method) [${result.returnedToolCount}]:`);

  if (result.returnedToolCount === 0) {
    console.log("   ⚠️  No tools returned!");
  } else {
    result.returnedToolsDetails.forEach((tool) => {
      console.log(`   • ${tool.app} → ${tool.class} → ${tool.method}`);
    });
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

  console.log(`\n📈 Accuracy Metrics (max 10 tools):`);
  console.log(`   True Positives (TP):   ${result.truePositives.toString().padStart(4)} - Correct tools returned`);
  console.log(`   False Positives (FP):  ${result.falsePositives.toString().padStart(4)} - Incorrect tools returned`);
  console.log(`   False Negatives (FN):  ${result.falseNegatives.toString().padStart(4)} - Expected tools missed`);
  console.log(`   True Negatives (TN):   ${result.trueNegatives.toString().padStart(4)} - Empty slots (10 - TP - FP)`);
  console.log(``);
  console.log(`   Precision:             ${(result.precision * 100).toFixed(1)}% - Accuracy of returned tools`);
  console.log(`   Recall:                ${(result.recall * 100).toFixed(1)}% - Coverage of expected tools`);
  console.log(`   F1 Score:              ${(result.f1Score * 100).toFixed(1)}% - Harmonic mean`);
  console.log(`   False Positive Rate:   ${(result.falsePositiveRate * 100).toFixed(3)}% - FP / (FP + TN)`);
  console.log(`   False Negative Rate:   ${(result.falseNegativeRate * 100).toFixed(1)}% - FN / (TP + FN)`);

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

  // Calculate aggregate metrics (excluding error cases)
  const validResults = results.filter((r) => !r.error);
  if (validResults.length > 0) {
    const totalTP = validResults.reduce((sum, r) => sum + r.truePositives, 0);
    const totalFP = validResults.reduce((sum, r) => sum + r.falsePositives, 0);
    const totalFN = validResults.reduce((sum, r) => sum + r.falseNegatives, 0);
    const totalTN = validResults.reduce((sum, r) => sum + r.trueNegatives, 0);

    const avgPrecision =
      validResults.reduce((sum, r) => sum + r.precision, 0) / validResults.length;
    const avgRecall =
      validResults.reduce((sum, r) => sum + r.recall, 0) / validResults.length;
    const avgF1 =
      validResults.reduce((sum, r) => sum + r.f1Score, 0) / validResults.length;
    const avgFPR =
      validResults.reduce((sum, r) => sum + r.falsePositiveRate, 0) /
      validResults.length;
    const avgFNR =
      validResults.reduce((sum, r) => sum + r.falseNegativeRate, 0) /
      validResults.length;

    // Calculate aggregate precision and recall from totals
    const aggregatePrecision =
      totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
    const aggregateRecall =
      totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
    const aggregateF1 =
      aggregatePrecision + aggregateRecall > 0
        ? (2 * aggregatePrecision * aggregateRecall) /
          (aggregatePrecision + aggregateRecall)
        : 0;
    const aggregateFPR =
      totalFP + totalTN > 0 ? totalFP / (totalFP + totalTN) : 0;
    const aggregateFNR =
      totalTP + totalFN > 0 ? totalFN / (totalTP + totalFN) : 0;

    console.log(`\n📈 Aggregate Accuracy Metrics (${validResults.length} valid tests):`);
    console.log(`\n   Totals:`);
    console.log(`   • True Positives:      ${totalTP.toString().padStart(6)}`);
    console.log(`   • False Positives:     ${totalFP.toString().padStart(6)}`);
    console.log(`   • False Negatives:     ${totalFN.toString().padStart(6)}`);
    console.log(`   • True Negatives:      ${totalTN.toString().padStart(6)}`);

    console.log(`\n   Average Per-Test Metrics:`);
    console.log(`   • Avg Precision:       ${(avgPrecision * 100).toFixed(1)}%`);
    console.log(`   • Avg Recall:          ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`   • Avg F1 Score:        ${(avgF1 * 100).toFixed(1)}%`);
    console.log(`   • Avg FP Rate:         ${(avgFPR * 100).toFixed(3)}%`);
    console.log(`   • Avg FN Rate:         ${(avgFNR * 100).toFixed(1)}%`);

    console.log(`\n   Aggregate Metrics (across all tests):`);
    console.log(`   • Aggregate Precision: ${(aggregatePrecision * 100).toFixed(1)}%`);
    console.log(`   • Aggregate Recall:    ${(aggregateRecall * 100).toFixed(1)}%`);
    console.log(`   • Aggregate F1 Score:  ${(aggregateF1 * 100).toFixed(1)}%`);
    console.log(`   • Aggregate FP Rate:   ${(aggregateFPR * 100).toFixed(3)}%`);
    console.log(`   • Aggregate FN Rate:   ${(aggregateFNR * 100).toFixed(1)}%`);

    console.log(`\n   📉 Error Rate Analysis:`);
    console.log(
      `   • Equal Error Rate (EER): ~${(((avgFPR + avgFNR) / 2) * 100).toFixed(2)}%`
    );
    console.log(
      `     (Average of FPR and FNR - lower is better, 0% is perfect)`
    );

    // Find best and worst performing tests
    const sortedByF1 = [...validResults].sort((a, b) => b.f1Score - a.f1Score);
    const best = sortedByF1[0];
    const worst = sortedByF1[sortedByF1.length - 1];

    if (best && worst && validResults.length > 1) {
      console.log(`\n   🏆 Best Performing Test:`);
      console.log(`   • Prompt: "${best.prompt.substring(0, 60)}${best.prompt.length > 60 ? "..." : ""}"`);
      console.log(`   • F1 Score: ${(best.f1Score * 100).toFixed(1)}%`);
      console.log(`   • Precision: ${(best.precision * 100).toFixed(1)}%, Recall: ${(best.recall * 100).toFixed(1)}%`);

      console.log(`\n   ⚠️  Worst Performing Test:`);
      console.log(`   • Prompt: "${worst.prompt.substring(0, 60)}${worst.prompt.length > 60 ? "..." : ""}"`);
      console.log(`   • F1 Score: ${(worst.f1Score * 100).toFixed(1)}%`);
      console.log(`   • Precision: ${(worst.precision * 100).toFixed(1)}%, Recall: ${(worst.recall * 100).toFixed(1)}%`);
    }
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
          console.log(`      Precision: ${(r.precision * 100).toFixed(1)}%, Recall: ${(r.recall * 100).toFixed(1)}%, F1: ${(r.f1Score * 100).toFixed(1)}%`);
        }
      });
  }

  console.log("\n" + "=".repeat(70));
}

/**
 * Exports summary to TXT file
 */
function exportSummaryToTXT(results: TestResult[], filename: string) {
  const validResults = results.filter((r) => !r.error);
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const errors = results.filter((r) => r.error).length;

  let content = "";
  content += "=".repeat(70) + "\n";
  content += "TEST SUMMARY - AGGREGATED RESULTS\n";
  content += "=".repeat(70) + "\n\n";
  content += `Generated: ${new Date().toISOString()}\n`;
  content += `Total Tests: ${results.length}\n`;
  content += `Passed: ${passed} (${((passed / results.length) * 100).toFixed(1)}%)\n`;
  content += `Failed: ${failed} (${((failed / results.length) * 100).toFixed(1)}%)\n`;
  if (errors > 0) {
    content += `Errors: ${errors}\n`;
  }
  content += "\n";

  if (validResults.length > 0) {
    const totalTP = validResults.reduce((sum, r) => sum + r.truePositives, 0);
    const totalFP = validResults.reduce((sum, r) => sum + r.falsePositives, 0);
    const totalFN = validResults.reduce((sum, r) => sum + r.falseNegatives, 0);
    const totalTN = validResults.reduce((sum, r) => sum + r.trueNegatives, 0);

    const avgPrecision =
      validResults.reduce((sum, r) => sum + r.precision, 0) / validResults.length;
    const avgRecall =
      validResults.reduce((sum, r) => sum + r.recall, 0) / validResults.length;
    const avgF1 =
      validResults.reduce((sum, r) => sum + r.f1Score, 0) / validResults.length;
    const avgFPR =
      validResults.reduce((sum, r) => sum + r.falsePositiveRate, 0) /
      validResults.length;
    const avgFNR =
      validResults.reduce((sum, r) => sum + r.falseNegativeRate, 0) /
      validResults.length;

    const aggregatePrecision =
      totalTP + totalFP > 0 ? totalTP / (totalTP + totalFP) : 0;
    const aggregateRecall =
      totalTP + totalFN > 0 ? totalTP / (totalTP + totalFN) : 0;
    const aggregateF1 =
      aggregatePrecision + aggregateRecall > 0
        ? (2 * aggregatePrecision * aggregateRecall) /
          (aggregatePrecision + aggregateRecall)
        : 0;
    const aggregateFPR =
      totalFP + totalTN > 0 ? totalFP / (totalFP + totalTN) : 0;
    const aggregateFNR =
      totalTP + totalFN > 0 ? totalFN / (totalTP + totalFN) : 0;

    content += "AGGREGATE ACCURACY METRICS\n";
    content += "-".repeat(70) + "\n\n";
    content += "Confusion Matrix Totals:\n";
    content += `  True Positives (TP):   ${totalTP}\n`;
    content += `  False Positives (FP):  ${totalFP}\n`;
    content += `  False Negatives (FN):  ${totalFN}\n`;
    content += `  True Negatives (TN):   ${totalTN}\n\n`;

    content += "Average Per-Test Metrics:\n";
    content += `  Precision:             ${(avgPrecision * 100).toFixed(1)}%\n`;
    content += `  Recall:                ${(avgRecall * 100).toFixed(1)}%\n`;
    content += `  F1 Score:              ${(avgF1 * 100).toFixed(1)}%\n`;
    content += `  False Positive Rate:   ${(avgFPR * 100).toFixed(3)}%\n`;
    content += `  False Negative Rate:   ${(avgFNR * 100).toFixed(1)}%\n\n`;

    content += "Aggregate Metrics (across all tests):\n";
    content += `  Precision:             ${(aggregatePrecision * 100).toFixed(1)}%\n`;
    content += `  Recall:                ${(aggregateRecall * 100).toFixed(1)}%\n`;
    content += `  F1 Score:              ${(aggregateF1 * 100).toFixed(1)}%\n`;
    content += `  False Positive Rate:   ${(aggregateFPR * 100).toFixed(3)}%\n`;
    content += `  False Negative Rate:   ${(aggregateFNR * 100).toFixed(1)}%\n\n`;

    content += "Error Rate Analysis:\n";
    content += `  Equal Error Rate (EER): ${(((avgFPR + avgFNR) / 2) * 100).toFixed(2)}%\n`;
    content += `  (Average of FPR and FNR - lower is better, 0% is perfect)\n\n`;

    const sortedByF1 = [...validResults].sort((a, b) => b.f1Score - a.f1Score);
    const best = sortedByF1[0];
    const worst = sortedByF1[sortedByF1.length - 1];

    if (best && worst && validResults.length > 1) {
      content += "Best Performing Test:\n";
      content += `  Prompt: "${best.prompt.substring(0, 60)}${best.prompt.length > 60 ? "..." : ""}"\n`;
      content += `  F1 Score: ${(best.f1Score * 100).toFixed(1)}%\n`;
      content += `  Precision: ${(best.precision * 100).toFixed(1)}%, Recall: ${(best.recall * 100).toFixed(1)}%\n\n`;

      content += "Worst Performing Test:\n";
      content += `  Prompt: "${worst.prompt.substring(0, 60)}${worst.prompt.length > 60 ? "..." : ""}"\n`;
      content += `  F1 Score: ${(worst.f1Score * 100).toFixed(1)}%\n`;
      content += `  Precision: ${(worst.precision * 100).toFixed(1)}%, Recall: ${(worst.recall * 100).toFixed(1)}%\n\n`;
    }
  }

  if (failed > 0) {
    content += "FAILED TESTS SUMMARY\n";
    content += "-".repeat(70) + "\n\n";
    results
      .filter((r) => !r.passed)
      .forEach((r, index) => {
        content += `${index + 1}. Prompt ID: ${r.promptId}\n`;
        content += `   "${r.prompt.substring(0, 70)}${r.prompt.length > 70 ? "..." : ""}"\n`;
        if (r.error) {
          content += `   Error: ${r.error}\n`;
        } else {
          content += `   Metrics: Precision ${(r.precision * 100).toFixed(1)}%, Recall ${(r.recall * 100).toFixed(1)}%, F1 ${(r.f1Score * 100).toFixed(1)}%\n`;
          if (!r.allToolsFromExpectedClasses) {
            content += `   Issue: Some tools from unexpected classes\n`;
          }
          if (!r.allExpectedClassesRepresented) {
            content += `   Issue: Not all expected classes represented\n`;
          }
          if (r.returnedToolCount === 0) {
            content += `   Issue: No tools returned\n`;
          }
        }
        content += "\n";
      });
  }

  content += "=".repeat(70) + "\n";

  // Use filename as-is if it's already an absolute path, otherwise join with cwd
  const outputPath = path.isAbsolute(filename) 
    ? filename 
    : path.join(process.cwd(), filename);
  fs.writeFileSync(outputPath, content, "utf-8");

  console.log(`\n📄 Summary TXT exported to: ${outputPath}`);
}

/**
 * Exports test results to CSV file
 */
function exportToCSV(results: TestResult[], filename: string = "test-results.csv") {
  const csvHeaders = [
    "Prompt ID",
    "Prompt",
    "Expected Classes Count",
    "Returned Tools Count",
    "Passed",
    "True Positives",
    "False Positives",
    "False Negatives",
    "True Negatives",
    "Precision (%)",
    "Recall (%)",
    "F1 Score (%)",
    "False Positive Rate (%)",
    "False Negative Rate (%)",
    "All From Expected",
    "All Classes Represented",
    "Error",
  ];

  const csvRows = results.map((r) => [
    r.promptId,
    `"${r.prompt.replace(/"/g, '""')}"`, // Escape quotes in prompt text
    r.expectedClassIds.length,
    r.returnedToolCount,
    r.passed ? "PASS" : "FAIL",
    r.truePositives,
    r.falsePositives,
    r.falseNegatives,
    r.trueNegatives,
    (r.precision * 100).toFixed(2),
    (r.recall * 100).toFixed(2),
    (r.f1Score * 100).toFixed(2),
    (r.falsePositiveRate * 100).toFixed(4),
    (r.falseNegativeRate * 100).toFixed(2),
    r.allToolsFromExpectedClasses ? "YES" : "NO",
    r.allExpectedClassesRepresented ? "YES" : "NO",
    r.error ? `"${r.error.replace(/"/g, '""')}"` : "",
  ]);

  const csvContent = [csvHeaders.join(","), ...csvRows.map((row) => row.join(","))].join(
    "\n"
  );

  // Use filename as-is if it's already an absolute path, otherwise join with cwd
  const outputPath = path.isAbsolute(filename) 
    ? filename 
    : path.join(process.cwd(), filename);
  fs.writeFileSync(outputPath, csvContent, "utf-8");

  console.log(`\n📄 CSV exported to: ${outputPath}`);
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

  // Parse --limit argument
  let limit: number | null = null;
  if (args.includes("--limit")) {
    const limitIndex = args.indexOf("--limit");
    const limitValue = args[limitIndex + 1];
    if (!limitValue) {
      console.error("Error: --limit requires a number");
      process.exit(1);
    }
    limit = parseInt(limitValue, 10);
    if (isNaN(limit) || limit <= 0) {
      console.error("Error: --limit must be a positive number");
      process.exit(1);
    }
  }

  // Parse --csv flag and optional filename
  let exportCSV = false;
  let csvFilename = "test-results.csv";
  if (args.includes("--csv")) {
    exportCSV = true;
    const csvIndex = args.indexOf("--csv");
    const nextArg = args[csvIndex + 1];
    // If next arg exists and doesn't start with --, use it as filename
    if (nextArg && !nextArg.startsWith("--")) {
      csvFilename = nextArg;
    }
  }

  // Create test-results directory if it doesn't exist
  const testResultsDir = path.join(process.cwd(), "test-results");
  if (!fs.existsSync(testResultsDir)) {
    fs.mkdirSync(testResultsDir, { recursive: true });
  }

  // Generate timestamp for filenames
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "")
    .replace("T", "_");

  console.log("\n🧪 Default Prompts Test Suite");
  console.log("=".repeat(70));

  // Fetch prompts to test
  const prompts = await prisma.defaultPrompt.findMany({
    where: promptId ? { id: promptId } : undefined,
    orderBy: {
      createdAt: "desc",
    },
    take: limit || undefined,
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

  // Export files with matching timestamp
  // Both TXT and CSV use the same timestamp (generated once at the start)
  // This ensures they can be easily matched and compared
  
  // Always export summary TXT in test-results folder
  const summaryFilename = path.join(
    testResultsDir,
    `summary_${timestamp}.txt`
  );
  exportSummaryToTXT(results, summaryFilename);

  // Export to CSV if requested (uses same timestamp as TXT)
  if (exportCSV) {
    const csvPath = path.join(
      testResultsDir,
      csvFilename === "test-results.csv" 
        ? `results_${timestamp}.csv`  // Same timestamp as summary TXT
        : csvFilename.includes("/") 
          ? csvFilename  // Use as-is if it contains path
          : `${csvFilename.replace(".csv", "")}_${timestamp}.csv`
    );
    exportToCSV(results, csvPath);
  }

  // Exit with appropriate code
  const allPassed = results.every((r) => r.passed);
  process.exit(allPassed ? 0 : 1);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});

