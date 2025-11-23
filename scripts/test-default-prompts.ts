#!/usr/bin/env tsx

/**
 * Script to test default prompts against the tool selector
 *
 * Usage:
 *   tsx scripts/test-default-prompts.ts                        # Test all default prompts
 *   tsx scripts/test-default-prompts.ts --limit 10             # Test first 10 prompts
 *   tsx scripts/test-default-prompts.ts --limit 0              # Show cached results only
 *   tsx scripts/test-default-prompts.ts --prompt-id <id>       # Test specific prompt
 *   tsx scripts/test-default-prompts.ts --retry-failed         # Retry cases with precision=0 and recall=0
 *   tsx scripts/test-default-prompts.ts --clear-cache          # Clear cached results
 *
 * Makefile Commands:
 *   make test-prompts                                           # Test all prompts
 *   make test-prompts limit=10                                  # Test 10 prompts
 *   make test-prompts limit=0                                   # Show cached results only
 *   make test-prompts retry=yes                                 # Retry failed (precision=0, recall=0)
 *
 * Output:
 * - Always creates: test-results/summary_TIMESTAMP.txt (aggregate metrics)
 * - Caches results: test-results/test-cache.json (persistent results database)
 * - Files saved in test-results/ subfolder with ISO timestamps
 *
 * This script:
 * - Loads default prompts from the database with smart sampling:
 *   1. Prioritizes untested prompts first
 *   2. When all tested, re-tests oldest ones
 * - Calls selectTools() for each prompt
 * - Validates that:
 *   - All returned tools belong to the expected classes
 *   - At least one method from each expected class is returned
 * - Calculates accuracy metrics (class-based, max 10 tools):
 *   - True Positives (TP): Methods returned from expected classes
 *   - False Positives (FP): Methods returned from non-expected classes
 *   - False Negatives (FN): Expected classes with no representation
 *   - True Negatives (TN): Unused selection slots (10 - TP - FP - FN)
 *   - Precision, Recall, F1 Score
 *   - False Positive Rate, False Negative Rate
 *   - Equal Error Rate (EER)
 * - Displays App → Class pairs for expected tools
 * - Displays App → Class → Method for returned tools
 * - Prints detailed results and summary with aggregate metrics
 * - Exports timestamped summary TXT to test-results/
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { selectTools } from "../lib/tool-selector";
import { Method } from "@/types/tool";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
config();

// Cache file path
const CACHE_FILE = path.join(process.cwd(), "test-results", "test-cache.json");

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
  testedAt: string; // ISO timestamp when test was run
  // Class-based accuracy metrics (working with class representation, not all methods)
  truePositives: number; // Methods returned from expected classes
  falsePositives: number; // Methods returned from non-expected classes
  falseNegatives: number; // Expected classes with NO representation (not all missing methods)
  trueNegatives: number; // Unused selection slots (10 - TP - FP - FN)
  precision: number; // TP / (TP + FP) - accuracy of returned tools
  recall: number; // TP / (TP + FN) - coverage of expected classes
  f1Score: number; // 2 * (precision * recall) / (precision + recall)
  falsePositiveRate: number; // FP / (FP + TN)
  falseNegativeRate: number; // FN / (TP + FN)
  // App-level metrics
  appPrecision: number; // Correct apps / Total returned apps
  appRecall: number; // Correct apps / Total expected apps
  appF1Score: number; // F1 for apps
  // Category-level metrics
  categoryPrecision: number; // Correct categories / Total returned categories
  categoryRecall: number; // Correct categories / Total expected categories
  categoryF1Score: number; // F1 for categories
  // Class-level metrics
  classPrecision: number; // Correct classes / Total returned classes
  classRecall: number; // Correct classes / Total expected classes
  classF1Score: number; // F1 for classes
}

interface TestCache {
  lastUpdated: string;
  results: { [promptId: string]: TestResult };
}

/**
 * Load cached test results
 */
function loadCache(): TestCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const content = fs.readFileSync(CACHE_FILE, "utf-8");
      const cache = JSON.parse(content);
      // Convert Map fields back from JSON
      if (cache.results) {
        Object.values(cache.results).forEach((result: TestResult) => {
          if (
            result.returnedToolsByClass &&
            typeof result.returnedToolsByClass === "object"
          ) {
            result.returnedToolsByClass = new Map(
              Object.entries(result.returnedToolsByClass)
            );
          }
        });
      }
      return cache;
    }
  } catch (error) {
    console.warn(`⚠️  Warning: Could not load cache: ${error}`);
  }
  return { lastUpdated: new Date().toISOString(), results: {} };
}

/**
 * Save test results to cache
 */
function saveCache(cache: TestCache) {
  try {
    // Convert Map fields to JSON-serializable objects
    const serializable = {
      ...cache,
      results: Object.fromEntries(
        Object.entries(cache.results).map(([id, result]) => [
          id,
          {
            ...result,
            returnedToolsByClass: result.returnedToolsByClass
              ? Object.fromEntries(result.returnedToolsByClass)
              : {},
          },
        ])
      ),
    };

    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(serializable, null, 2),
      "utf-8"
    );
  } catch (error) {
    console.error(`❌ Error saving cache: ${error}`);
  }
}

/**
 * Clear the test cache
 */
function clearCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE);
      console.log("✓ Cache cleared");
    } else {
      console.log("ℹ️  No cache file to clear");
    }
  } catch (error) {
    console.error(`❌ Error clearing cache: ${error}`);
  }
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
    testedAt: new Date().toISOString(),
    truePositives: 0,
    falsePositives: 0,
    falseNegatives: 0,
    trueNegatives: 0,
    precision: 0,
    recall: 0,
    f1Score: 0,
    falsePositiveRate: 0,
    falseNegativeRate: 0,
    appPrecision: 0,
    appRecall: 0,
    appF1Score: 0,
    categoryPrecision: 0,
    categoryRecall: 0,
    categoryF1Score: 0,
    classPrecision: 0,
    classRecall: 0,
    classF1Score: 0,
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

    // Fetch expected classes with app and category information
    const expectedClassesWithApps = await prisma.class.findMany({
      where: {
        id: {
          in: expectedClassIds,
        },
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            categoryId: true,
          },
        },
      },
    });

    // Populate app,class pairs for expected classes
    result.expectedAppClassPairs = expectedClassesWithApps.map((cls) => ({
      app: cls.app.name,
      class: cls.name,
    }));

    // Call selectTools
    console.log(`\n📞 Calling selectTools()...`);
    const toolSelectorResult = await selectTools(promptText, []);
    const returnedMethods =
      toolSelectorResult.tools.length > 0 &&
      typeof toolSelectorResult.tools[0] !== "string"
        ? (toolSelectorResult.tools as Method[])
        : [];

    result.returnedToolCount = returnedMethods.length;

    // Fetch class, app, and category information for returned methods
    const returnedMethodClassIds = [
      ...new Set(returnedMethods.map((m) => m.classId)),
    ];
    const returnedClasses = await prisma.class.findMany({
      where: {
        id: {
          in: returnedMethodClassIds,
        },
      },
      include: {
        app: {
          select: {
            id: true,
            name: true,
            categoryId: true,
          },
        },
      },
    });

    const classIdToInfo = new Map<
      string,
      { className: string; appName: string }
    >();
    returnedClasses.forEach((cls) => {
      classIdToInfo.set(cls.id, {
        className: cls.name,
        appName: cls.app.name,
      });
    });

    // Group returned methods by class and collect details
    for (const method of returnedMethods) {
      const classInfo = classIdToInfo.get(method.classId);
      const className =
        classInfo?.className || classIdToName.get(method.classId) || "Unknown";
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
    // We work at the class level: did we return methods from the expected classes?

    // True Positives: Returned methods that are from expected classes
    result.truePositives = returnedMethods.filter((m) =>
      expectedClassIds.includes(m.classId)
    ).length;

    // False Positives: Returned methods that are NOT from expected classes
    result.falsePositives = returnedMethods.filter(
      (m) => !expectedClassIds.includes(m.classId)
    ).length;

    // False Negatives: Expected classes that have NO methods returned
    // Count each missing class as 1 FN (not all methods in those classes)
    const representedClassIds = new Set(returnedMethods.map((m) => m.classId));
    result.falseNegatives = expectedClassIds.filter(
      (classId) => !representedClassIds.has(classId)
    ).length;

    // True Negatives: Available slots in the max 10 selection space that weren't used
    // Since the tool selector can return max 10 tools:
    // - Selection space = 10
    // - Used slots = TP + FP (total returned methods)
    // - Unused slots = FN (expected classes not returned) + available empty slots
    // - TN = 10 - TP - FP - FN (correctly unused slots)
    const MAX_TOOLS = 10;
    result.trueNegatives =
      MAX_TOOLS -
      result.truePositives -
      result.falsePositives -
      result.falseNegatives;

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
        ? (2 * result.precision * result.recall) /
          (result.precision + result.recall)
        : 0;

    // False Positive Rate: FP / (FP + TN)
    result.falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : 0;

    // False Negative Rate: FN / (TP + FN) = 1 - Recall
    result.falseNegativeRate = tp + fn > 0 ? fn / (tp + fn) : 0;

    // Calculate App-level Precision and Recall
    const expectedAppIds = new Set(
      expectedClassesWithApps.map((cls) => cls.app.id)
    );
    const returnedAppIds = new Set(returnedClasses.map((cls) => cls.app.id));
    const correctAppIds = [...returnedAppIds].filter((id) =>
      expectedAppIds.has(id)
    );

    result.appPrecision =
      returnedAppIds.size > 0 ? correctAppIds.length / returnedAppIds.size : 0;
    result.appRecall =
      expectedAppIds.size > 0 ? correctAppIds.length / expectedAppIds.size : 0;
    result.appF1Score =
      result.appPrecision + result.appRecall > 0
        ? (2 * result.appPrecision * result.appRecall) /
          (result.appPrecision + result.appRecall)
        : 0;

    // Calculate Category-level Precision and Recall
    const expectedCategoryIds = new Set(
      expectedClassesWithApps
        .map((cls) => cls.app.categoryId)
        .filter((id): id is string => id !== null)
    );
    const returnedCategoryIds = new Set(
      returnedClasses
        .map((cls) => cls.app.categoryId)
        .filter((id): id is string => id !== null)
    );
    const correctCategoryIds = [...returnedCategoryIds].filter((id) =>
      expectedCategoryIds.has(id)
    );

    result.categoryPrecision =
      returnedCategoryIds.size > 0
        ? correctCategoryIds.length / returnedCategoryIds.size
        : 0;
    result.categoryRecall =
      expectedCategoryIds.size > 0
        ? correctCategoryIds.length / expectedCategoryIds.size
        : 0;
    result.categoryF1Score =
      result.categoryPrecision + result.categoryRecall > 0
        ? (2 * result.categoryPrecision * result.categoryRecall) /
          (result.categoryPrecision + result.categoryRecall)
        : 0;

    // Calculate Class-level Precision and Recall
    const expectedClassIdSet = new Set(expectedClassIds);
    const returnedClassIdSet = new Set(returnedMethodClassIds);
    const correctClassIds = [...returnedClassIdSet].filter((id) =>
      expectedClassIdSet.has(id)
    );

    result.classPrecision =
      returnedClassIdSet.size > 0
        ? correctClassIds.length / returnedClassIdSet.size
        : 0;
    result.classRecall =
      expectedClassIdSet.size > 0
        ? correctClassIds.length / expectedClassIdSet.size
        : 0;
    result.classF1Score =
      result.classPrecision + result.classRecall > 0
        ? (2 * result.classPrecision * result.classRecall) /
          (result.classPrecision + result.classRecall)
        : 0;

    // Validation 1: All returned tools belong to expected classes
    const allFromExpectedClasses = returnedMethods.every((method) =>
      expectedClassIds.includes(method.classId)
    );
    result.allToolsFromExpectedClasses = allFromExpectedClasses;

    // Validation 2: At least one method from each expected class
    // (representedClassIds already calculated above for FN)
    const allClassesRepresented = expectedClassIds.every((classId) =>
      representedClassIds.has(classId)
    );
    result.allExpectedClassesRepresented = allClassesRepresented;

    // Overall pass/fail
    result.passed =
      allFromExpectedClasses &&
      allClassesRepresented &&
      returnedMethods.length > 0;
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

  console.log(
    `📚 Expected (App → Class) [${result.expectedAppClassPairs.length}]:`
  );
  result.expectedAppClassPairs.forEach((pair) => {
    console.log(`   • ${pair.app} → ${pair.class}`);
  });

  if (result.error) {
    console.log(`\n❌ ERROR: ${result.error}`);
    return;
  }

  console.log(
    `\n🔧 Returned (App → Class → Method) [${result.returnedToolCount}]:`
  );

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

  console.log(`\n📈 Accuracy Metrics (class-based, max 10 tools):`);
  console.log(
    `   True Positives (TP):   ${result.truePositives.toString().padStart(4)} - Methods from expected classes`
  );
  console.log(
    `   False Positives (FP):  ${result.falsePositives.toString().padStart(4)} - Methods from wrong classes`
  );
  console.log(
    `   False Negatives (FN):  ${result.falseNegatives.toString().padStart(4)} - Expected classes not represented`
  );
  console.log(
    `   True Negatives (TN):   ${result.trueNegatives.toString().padStart(4)} - Unused slots (10 - TP - FP - FN)`
  );
  console.log(``);
  console.log(
    `   Precision:             ${(result.precision * 100).toFixed(1)}% - Accuracy of returned tools`
  );
  console.log(
    `   Recall:                ${(result.recall * 100).toFixed(1)}% - Coverage of expected classes`
  );
  console.log(
    `   F1 Score:              ${(result.f1Score * 100).toFixed(1)}% - Harmonic mean`
  );
  console.log(
    `   False Positive Rate:   ${(result.falsePositiveRate * 100).toFixed(3)}% - FP / (FP + TN)`
  );
  console.log(
    `   False Negative Rate:   ${(result.falseNegativeRate * 100).toFixed(1)}% - FN / (TP + FN)`
  );

  console.log(`\n📊 Hierarchical Accuracy:`);
  console.log(`   App Level:`);
  console.log(
    `     Precision: ${(result.appPrecision * 100).toFixed(1)}%, Recall: ${(result.appRecall * 100).toFixed(1)}%, F1: ${(result.appF1Score * 100).toFixed(1)}%`
  );
  console.log(`   Category Level:`);
  console.log(
    `     Precision: ${(result.categoryPrecision * 100).toFixed(1)}%, Recall: ${(result.categoryRecall * 100).toFixed(1)}%, F1: ${(result.categoryF1Score * 100).toFixed(1)}%`
  );
  console.log(`   Class Level:`);
  console.log(
    `     Precision: ${(result.classPrecision * 100).toFixed(1)}%, Recall: ${(result.classRecall * 100).toFixed(1)}%, F1: ${(result.classF1Score * 100).toFixed(1)}%`
  );

  console.log(`\n${result.passed ? "✅ PASSED" : "❌ FAILED"}`);
}

/**
 * Prints the summary of all test results
 */
function printSummary(
  results: TestResult[],
  cacheSize?: number,
  showingCached: boolean = false
) {
  console.log("\n\n" + "=".repeat(70));
  console.log("📊 TEST SUMMARY");
  console.log("=".repeat(70));

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const errors = results.filter((r) => r.error).length;

  console.log(
    `\n${showingCached ? "Cached Results:" : "Current Run:"} ${results.length} test(s)`
  );
  if (cacheSize !== undefined && cacheSize > 0) {
    console.log(`Total in Cache: ${cacheSize} test(s)`);
  }
  console.log(
    `✅ Passed: ${passed} (${results.length > 0 ? ((passed / results.length) * 100).toFixed(1) : 0}%)`
  );
  console.log(
    `❌ Failed: ${failed} (${results.length > 0 ? ((failed / results.length) * 100).toFixed(1) : 0}%)`
  );
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
      validResults.reduce((sum, r) => sum + r.precision, 0) /
      validResults.length;
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

    console.log(
      `\n📈 Aggregate Accuracy Metrics (${validResults.length} valid tests):`
    );
    console.log(`\n   Totals:`);
    console.log(`   • True Positives:      ${totalTP.toString().padStart(6)}`);
    console.log(`   • False Positives:     ${totalFP.toString().padStart(6)}`);
    console.log(`   • False Negatives:     ${totalFN.toString().padStart(6)}`);
    console.log(`   • True Negatives:      ${totalTN.toString().padStart(6)}`);

    console.log(`\n   Average Per-Test Metrics (Method-Level):`);
    console.log(
      `   • Avg Precision:       ${(avgPrecision * 100).toFixed(1)}%`
    );
    console.log(`   • Avg Recall:          ${(avgRecall * 100).toFixed(1)}%`);
    console.log(`   • Avg F1 Score:        ${(avgF1 * 100).toFixed(1)}%`);
    console.log(`   • Avg FP Rate:         ${(avgFPR * 100).toFixed(3)}%`);
    console.log(`   • Avg FN Rate:         ${(avgFNR * 100).toFixed(1)}%`);

    // Calculate average hierarchical metrics
    const avgAppPrecision =
      validResults.reduce((sum, r) => sum + r.appPrecision, 0) /
      validResults.length;
    const avgAppRecall =
      validResults.reduce((sum, r) => sum + r.appRecall, 0) /
      validResults.length;
    const avgAppF1 =
      validResults.reduce((sum, r) => sum + r.appF1Score, 0) /
      validResults.length;

    const avgCategoryPrecision =
      validResults.reduce((sum, r) => sum + r.categoryPrecision, 0) /
      validResults.length;
    const avgCategoryRecall =
      validResults.reduce((sum, r) => sum + r.categoryRecall, 0) /
      validResults.length;
    const avgCategoryF1 =
      validResults.reduce((sum, r) => sum + r.categoryF1Score, 0) /
      validResults.length;

    const avgClassPrecision =
      validResults.reduce((sum, r) => sum + r.classPrecision, 0) /
      validResults.length;
    const avgClassRecall =
      validResults.reduce((sum, r) => sum + r.classRecall, 0) /
      validResults.length;
    const avgClassF1 =
      validResults.reduce((sum, r) => sum + r.classF1Score, 0) /
      validResults.length;

    console.log(`\n   Average Hierarchical Metrics:`);
    console.log(
      `   • App Level:           Precision ${(avgAppPrecision * 100).toFixed(1)}%, Recall ${(avgAppRecall * 100).toFixed(1)}%, F1 ${(avgAppF1 * 100).toFixed(1)}%`
    );
    console.log(
      `   • Category Level:      Precision ${(avgCategoryPrecision * 100).toFixed(1)}%, Recall ${(avgCategoryRecall * 100).toFixed(1)}%, F1 ${(avgCategoryF1 * 100).toFixed(1)}%`
    );
    console.log(
      `   • Class Level:         Precision ${(avgClassPrecision * 100).toFixed(1)}%, Recall ${(avgClassRecall * 100).toFixed(1)}%, F1 ${(avgClassF1 * 100).toFixed(1)}%`
    );

    console.log(`\n   Aggregate Metrics (across all tests):`);
    console.log(
      `   • Aggregate Precision: ${(aggregatePrecision * 100).toFixed(1)}%`
    );
    console.log(
      `   • Aggregate Recall:    ${(aggregateRecall * 100).toFixed(1)}%`
    );
    console.log(`   • Aggregate F1 Score:  ${(aggregateF1 * 100).toFixed(1)}%`);
    console.log(
      `   • Aggregate FP Rate:   ${(aggregateFPR * 100).toFixed(3)}%`
    );
    console.log(
      `   • Aggregate FN Rate:   ${(aggregateFNR * 100).toFixed(1)}%`
    );

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
      console.log(
        `   • Prompt: "${best.prompt.substring(0, 60)}${best.prompt.length > 60 ? "..." : ""}"`
      );
      console.log(`   • F1 Score: ${(best.f1Score * 100).toFixed(1)}%`);
      console.log(
        `   • Precision: ${(best.precision * 100).toFixed(1)}%, Recall: ${(best.recall * 100).toFixed(1)}%`
      );

      console.log(`\n   ⚠️  Worst Performing Test:`);
      console.log(
        `   • Prompt: "${worst.prompt.substring(0, 60)}${worst.prompt.length > 60 ? "..." : ""}"`
      );
      console.log(`   • F1 Score: ${(worst.f1Score * 100).toFixed(1)}%`);
      console.log(
        `   • Precision: ${(worst.precision * 100).toFixed(1)}%, Recall: ${(worst.recall * 100).toFixed(1)}%`
      );
    }
  }

  if (failed > 0) {
    console.log(`\n❌ Failed Tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r, index) => {
        console.log(`   ${index + 1}. Prompt ID: ${r.promptId}`);
        console.log(
          `      "${r.prompt.substring(0, 80)}${r.prompt.length > 80 ? "..." : ""}"`
        );
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
          console.log(
            `      Precision: ${(r.precision * 100).toFixed(1)}%, Recall: ${(r.recall * 100).toFixed(1)}%, F1: ${(r.f1Score * 100).toFixed(1)}%`
          );
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
      validResults.reduce((sum, r) => sum + r.precision, 0) /
      validResults.length;
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

    const avgAppPrecision =
      validResults.reduce((sum, r) => sum + r.appPrecision, 0) /
      validResults.length;
    const avgAppRecall =
      validResults.reduce((sum, r) => sum + r.appRecall, 0) /
      validResults.length;
    const avgAppF1 =
      validResults.reduce((sum, r) => sum + r.appF1Score, 0) /
      validResults.length;
    const avgCategoryPrecision =
      validResults.reduce((sum, r) => sum + r.categoryPrecision, 0) /
      validResults.length;
    const avgCategoryRecall =
      validResults.reduce((sum, r) => sum + r.categoryRecall, 0) /
      validResults.length;
    const avgCategoryF1 =
      validResults.reduce((sum, r) => sum + r.categoryF1Score, 0) /
      validResults.length;
    const avgClassPrecision =
      validResults.reduce((sum, r) => sum + r.classPrecision, 0) /
      validResults.length;
    const avgClassRecall =
      validResults.reduce((sum, r) => sum + r.classRecall, 0) /
      validResults.length;
    const avgClassF1 =
      validResults.reduce((sum, r) => sum + r.classF1Score, 0) /
      validResults.length;

    content += "Average Per-Test Metrics (Method-Level):\n";
    content += `  Precision:             ${(avgPrecision * 100).toFixed(1)}%\n`;
    content += `  Recall:                ${(avgRecall * 100).toFixed(1)}%\n`;
    content += `  F1 Score:              ${(avgF1 * 100).toFixed(1)}%\n`;
    content += `  False Positive Rate:   ${(avgFPR * 100).toFixed(3)}%\n`;
    content += `  False Negative Rate:   ${(avgFNR * 100).toFixed(1)}%\n\n`;

    content += "Average Hierarchical Metrics:\n";
    content += `  App Level:             Precision ${(avgAppPrecision * 100).toFixed(1)}%, Recall ${(avgAppRecall * 100).toFixed(1)}%, F1 ${(avgAppF1 * 100).toFixed(1)}%\n`;
    content += `  Category Level:        Precision ${(avgCategoryPrecision * 100).toFixed(1)}%, Recall ${(avgCategoryRecall * 100).toFixed(1)}%, F1 ${(avgCategoryF1 * 100).toFixed(1)}%\n`;
    content += `  Class Level:           Precision ${(avgClassPrecision * 100).toFixed(1)}%, Recall ${(avgClassRecall * 100).toFixed(1)}%, F1 ${(avgClassF1 * 100).toFixed(1)}%\n\n`;

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

async function main() {
  const args = process.argv.slice(2);

  // Parse --clear-cache flag
  if (args.includes("--clear-cache")) {
    clearCache();
    process.exit(0);
  }

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

  // Parse --limit argument (allow 0 for cache-only mode)
  let limit: number | null = null;
  if (args.includes("--limit")) {
    const limitIndex = args.indexOf("--limit");
    const limitValue = args[limitIndex + 1];
    if (!limitValue) {
      console.error("Error: --limit requires a number");
      process.exit(1);
    }
    limit = parseInt(limitValue, 10);
    if (isNaN(limit) || limit < 0) {
      console.error("Error: --limit must be a non-negative number");
      process.exit(1);
    }
  }

  // Parse --retry-failed flag
  let retryFailed = false;
  if (args.includes("--retry-failed")) {
    retryFailed = true;
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

  // Load cache
  const cache = loadCache();
  const cacheSize = Object.keys(cache.results).length;

  if (cacheSize > 0) {
    console.log(`\n💾 Loaded cache with ${cacheSize} existing result(s)`);
  }

  // Check if this is cache-only mode (limit = 0)
  if (limit === 0) {
    console.log(`\n📊 Showing cached results only (limit=0)\n`);
    const cachedResults = Object.values(cache.results);

    if (cachedResults.length === 0) {
      console.error(`\n❌ Error: No cached results found.`);
      console.log(`   Run tests first to build cache.`);
      process.exit(1);
    }

    printSummary(cachedResults, cacheSize, true);

    // Export summary with cached results
    const summaryFilename = path.join(
      testResultsDir,
      `summary_cached_${timestamp}.txt`
    );
    exportSummaryToTXT(cachedResults, summaryFilename);

    process.exit(0);
  }

  // Fetch prompts to test with smart sampling:
  // 1. If retryFailed is true, fetch failed cases
  // 2. If specific promptId requested, fetch it
  // 3. Otherwise, prioritize untested prompts
  // 4. If all tested, re-test oldest ones first
  let prompts;

  // Check if this is retry-failed mode
  if (retryFailed) {
    console.log(
      `\n🔄 Retry Failed Mode: Re-testing cases with precision=0 and recall=0\n`
    );
    const cachedResults = Object.values(cache.results);

    if (cachedResults.length === 0) {
      console.error(`\n❌ Error: No cached results found.`);
      console.log(`   Run tests first to build cache.`);
      process.exit(1);
    }

    // Find all failed cases (precision=0 AND recall=0)
    const failedCases = cachedResults.filter(
      (result) => result.precision === 0 && result.recall === 0
    );

    if (failedCases.length === 0) {
      console.log(
        `\n✅ No failed cases found (all tests have precision > 0 or recall > 0)`
      );
      process.exit(0);
    }

    console.log(`\n📋 Found ${failedCases.length} failed case(s) to retry:`);
    failedCases.forEach((result, idx) => {
      console.log(
        `   ${idx + 1}. ${result.promptId}: "${result.prompt.substring(0, 60)}${result.prompt.length > 60 ? "..." : ""}"`
      );
    });

    // Fetch the prompts from database
    const failedPromptIds = failedCases.map((r) => r.promptId);
    prompts = await prisma.defaultPrompt.findMany({
      where: { id: { in: failedPromptIds } },
    });

    console.log(`\n🔄 Re-testing ${prompts.length} failed prompt(s)...\n`);

    // Continue to testing loop below
  }
  if (!retryFailed && promptId) {
    // Specific prompt requested
    prompts = await prisma.defaultPrompt.findMany({
      where: { id: promptId },
    });
  } else if (!retryFailed) {
    const cachedPromptIds = Object.keys(cache.results);

    // Try to fetch untested prompts first
    const untestedPrompts = await prisma.defaultPrompt.findMany({
      where:
        cachedPromptIds.length > 0
          ? {
              id: { notIn: cachedPromptIds },
            }
          : undefined,
      orderBy: { createdAt: "desc" },
      take: limit || undefined,
    });

    // If we got enough untested prompts, use them
    if (!limit || untestedPrompts.length >= limit) {
      prompts = untestedPrompts;
      if (untestedPrompts.length > 0) {
        console.log(
          `\n✨ Testing ${untestedPrompts.length} untested prompt(s)`
        );
      }
    } else {
      // Not enough untested prompts, also fetch oldest tested ones
      const neededCount = limit - untestedPrompts.length;

      // Get tested prompts sorted by oldest test date
      const oldestTestedIds = Object.entries(cache.results)
        .sort(
          ([, a], [, b]) =>
            new Date(a.testedAt).getTime() - new Date(b.testedAt).getTime()
        )
        .slice(0, neededCount)
        .map(([id]) => id);

      const oldestTestedPrompts = await prisma.defaultPrompt.findMany({
        where: { id: { in: oldestTestedIds } },
      });

      prompts = [...untestedPrompts, ...oldestTestedPrompts];

      console.log(
        `\n✨ Testing ${untestedPrompts.length} untested + ${oldestTestedPrompts.length} oldest tested prompt(s)`
      );
    }
  }

  if (!prompts || prompts.length === 0) {
    if (retryFailed) {
      console.error(`\n❌ Error: Failed to fetch prompts for retry.`);
    } else if (promptId) {
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

    // Update cache with this result
    cache.results[result.promptId] = result;
  }

  // Save updated cache
  cache.lastUpdated = new Date().toISOString();
  saveCache(cache);
  console.log(
    `\n💾 Cache updated (${Object.keys(cache.results).length} total results)`
  );

  // Show summary for current run
  printSummary(results, Object.keys(cache.results).length, false);

  // If cache has more results than current run, show aggregate summary
  if (Object.keys(cache.results).length > results.length) {
    console.log("\n\n" + "=".repeat(70));
    console.log("📦 AGGREGATE SUMMARY (ALL CACHED RESULTS)");
    console.log("=".repeat(70));
    const allCachedResults = Object.values(cache.results);
    printSummary(allCachedResults, Object.keys(cache.results).length, true);
  }

  // Always export summary TXT in test-results folder
  const summaryFilename = path.join(
    testResultsDir,
    retryFailed ? `summary_retry_${timestamp}.txt` : `summary_${timestamp}.txt`
  );
  exportSummaryToTXT(results, summaryFilename);

  // Exit successfully - test failures are tracked results, not script errors
  process.exit(0);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
