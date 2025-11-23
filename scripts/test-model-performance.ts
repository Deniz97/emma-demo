/**
 * Test script to measure response time of different models
 * Tests each model with 2 small tasks and compares performance
 */

import dotenv from "dotenv";
import OpenAI from "openai";

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Define test tasks
const TASKS = [
  {
    name: "Simple Math Reasoning",
    messages: [
      {
        role: "user" as const,
        content:
          "If a train travels 120 miles in 2 hours, then 180 miles in the next 3 hours, what is its average speed for the entire journey?",
      },
    ],
  },
  {
    name: "Text Summarization",
    messages: [
      {
        role: "user" as const,
        content:
          "Summarize this in one sentence: The Industrial Revolution was a period of major industrialization and innovation that took place during the late 1700s and early 1800s. It began in Great Britain and spread to the United States and other parts of the world. During this time, manufacturing shifted from hand production methods to machines, new chemical manufacturing and iron production processes were developed, and the use of steam power and water power increased dramatically.",
      },
    ],
  },
];

interface TestResult {
  model: string;
  task: string;
  responseTime: number;
  success: boolean;
  error?: string;
  outputTokens?: number;
}

/**
 * Test a single model on a single task
 */
async function testModelTask(
  model: string,
  task: (typeof TASKS)[0]
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: task.messages,
      temperature: 0.7,
      max_tokens: 500,
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      model,
      task: task.name,
      responseTime,
      success: true,
      outputTokens: response.usage?.completion_tokens,
    };
  } catch (error) {
    const endTime = Date.now();
    const responseTime = endTime - startTime;

    return {
      model,
      task: task.name,
      responseTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get unique models to test from ALL tiers in the config
 */
function getUniqueModels(): string[] {
  // Import the model configs directly to access all tiers
  const MODEL_CONFIGS = {
    fast: {
      chat: "gpt-3.5-turbo",
      toolSelector: "gpt-3.5-turbo",
      toolWrapper: "gpt-3.5-turbo",
      querySummarizer: "gpt-3.5-turbo",
      metaTools: "gpt-3.5-turbo",
      metadata: "gpt-3.5-turbo",
      embedding: "text-embedding-3-small",
      utility: "gpt-3.5-turbo",
    },
    normal: {
      chat: "gpt-4o",
      toolSelector: "gpt-4.1-nano",
      toolWrapper: "gpt-4o-mini",
      querySummarizer: "gpt-4.1-nano",
      metaTools: "gpt-4.1-nano",
      metadata: "gpt-4o-mini",
      embedding: "text-embedding-3-small",
      utility: "gpt-4o-mini",
    },
  };

  const allModels = new Set<string>();

  // Add all models from all tiers except embedding (not a chat model)
  Object.values(MODEL_CONFIGS).forEach((config) => {
    Object.entries(config).forEach(([key, model]) => {
      if (key !== "embedding") {
        allModels.add(model);
      }
    });
  });

  return Array.from(allModels).sort();
}

/**
 * Format time in milliseconds
 */
function formatTime(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Run all tests
 */
async function runTests() {
  console.log("=".repeat(80));
  console.log("Model Performance Benchmark");
  console.log("=".repeat(80));
  console.log();

  const models = getUniqueModels();
  console.log(`Testing ${models.length} unique models:`);
  models.forEach((model, i) => {
    console.log(`  ${i + 1}. ${model}`);
  });
  console.log();

  console.log(`Running ${TASKS.length} tasks per model...`);
  console.log();

  const results: TestResult[] = [];

  // Run tests sequentially to avoid rate limits
  for (const model of models) {
    console.log(`Testing ${model}...`);

    for (const task of TASKS) {
      console.log(`  - ${task.name}...`);
      const result = await testModelTask(model, task);
      results.push(result);

      if (result.success) {
        console.log(
          `    ✓ ${formatTime(result.responseTime)} (${result.outputTokens} tokens)`
        );
      } else {
        console.log(`    ✗ Failed: ${result.error}`);
      }
    }

    console.log();
  }

  // Print summary
  console.log("=".repeat(80));
  console.log("Results Summary");
  console.log("=".repeat(80));
  console.log();

  // Group results by task
  for (const task of TASKS) {
    console.log(`${task.name}:`);
    console.log("-".repeat(80));

    const taskResults = results
      .filter((r) => r.task === task.name && r.success)
      .sort((a, b) => a.responseTime - b.responseTime);

    if (taskResults.length === 0) {
      console.log("  No successful results");
    } else {
      const maxModelNameLength = Math.max(
        ...taskResults.map((r) => r.model.length)
      );

      taskResults.forEach((result, i) => {
        const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
        const modelName = result.model.padEnd(maxModelNameLength);
        const time = formatTime(result.responseTime).padStart(10);
        const tokens = result.outputTokens
          ? ` (${result.outputTokens} tokens)`
          : "";

        console.log(`  ${rank} ${modelName} ${time}${tokens}`);
      });
    }

    console.log();
  }

  // Overall average
  console.log("Overall Average Response Time:");
  console.log("-".repeat(80));

  const modelAverages = models.map((model) => {
    const modelResults = results.filter((r) => r.model === model && r.success);

    if (modelResults.length === 0) {
      return { model, avgTime: null, successCount: 0 };
    }

    const avgTime =
      modelResults.reduce((sum, r) => sum + r.responseTime, 0) /
      modelResults.length;

    return { model, avgTime, successCount: modelResults.length };
  });

  modelAverages
    .filter((m) => m.avgTime !== null)
    .sort((a, b) => a.avgTime! - b.avgTime!)
    .forEach((result, i) => {
      const rank = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : "  ";
      const maxModelNameLength = Math.max(...models.map((m) => m.length));
      const modelName = result.model.padEnd(maxModelNameLength);
      const time = formatTime(result.avgTime!).padStart(10);
      const successRate = `(${result.successCount}/${TASKS.length} tasks)`;

      console.log(`  ${rank} ${modelName} ${time} ${successRate}`);
    });

  console.log();
  console.log("=".repeat(80));
}

// Run the tests
runTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
