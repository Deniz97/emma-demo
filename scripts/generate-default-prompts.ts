#!/usr/bin/env tsx

/**
 * Script to generate default prompts for the chat interface
 * 
 * Usage:
 *   tsx scripts/generate-default-prompts.ts --limit 10
 *   tsx scripts/generate-default-prompts.ts --limit 20
 * 
 * This script:
 * - Randomly samples 2 apps from the database
 * - Loads all classes from those apps (without methods)
 * - Uses LLM to generate realistic queries that would be interesting, natural, and common
 * - LLM specifies which classes it expects to access to answer the question
 * - Saves the prompts and associated class IDs to the database
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import { openai } from "../lib/openai-client";

// Load environment variables
config();

/**
 * Shuffles an array randomly (Fisher-Yates shuffle)
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Randomly samples N items from an array
 */
function sampleArray<T>(array: T[], count: number): T[] {
  const shuffled = shuffleArray(array);
  return shuffled.slice(0, Math.min(count, array.length));
}

/**
 * Generates a prompt and returns both the query and the class names that would be needed
 */
async function generatePrompt(
  apps: Array<{
    id: string;
    name: string;
    description: string | null;
    classes: Array<{
      id: string;
      name: string;
      description: string | null;
    }>;
  }>
): Promise<{ query: string; classNames: string[] }> {
  // Build the app and class information for the LLM
  const appInfo = apps.map((app) => {
    const classList = app.classes
      .map((cls) => `    - ${cls.name}${cls.description ? `: ${cls.description}` : ""}`)
      .join("\n");
    
    return `- **${app.name}**
  ${app.description || "No description"}
  Available classes:
${classList}`;
  }).join("\n\n");

  const systemPrompt = `You are an AI assistant that generates realistic user queries for a cryptocurrency data API chatbot.
Given two cryptocurrency apps and their available classes, generate a short, direct question that a trader or market researcher would ask.

The query MUST:
- Be SHORT and DIRECT - aim for 1 sentence, maximum 2 sentences if absolutely necessary
- Be to-the-point and specific (e.g., "What were the biggest volume candles in the last 1 month?" or "What is the highest and lowest TVL chains and dexes that are still relatively big, like in top 20?")
- Sound like something a trader or market researcher would naturally ask
- Be conversational but concise - no fluff or unnecessary words
- Require fetching data from multiple classes across the provided apps
- Be specific enough to need actual data fetching (mention specific metrics, timeframes, or filters)

Examples of good queries:
- "What were the biggest volume candles in the last 1 month?"
- "What is the highest and lowest TVL chains and dexes that are still relatively big, like in top 20?"
- "Show me the top 10 tokens by trading volume in the last 24 hours"
- "Which DeFi protocols have the highest APY right now?"

You must also specify which classes from the provided apps would be needed to answer this question.

CRITICAL: You MUST return a valid JSON object with this exact structure:
{
  "query": "the user query text (short and direct, 1 sentence preferred)",
  "classNames": ["Class Name 1", "Class Name 2", ...]
}

Return ONLY the JSON object, no markdown, no code blocks, no explanation, no extra formatting.`;

  const userPrompt = `Given these cryptocurrency apps and their available classes:

${appInfo}

Generate a SHORT, DIRECT query that a trader or market researcher would ask. Keep it concise and to-the-point (1 sentence preferred). It should require data from multiple classes across these apps. Then specify which classes would be needed to answer it.

Return a JSON object with "query" (the short, direct user question) and "classNames" (array of class names needed).`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });

    // Better error handling and logging
    if (!response || !response.choices || response.choices.length === 0) {
      console.error("   API Response:", JSON.stringify(response, null, 2));
      throw new Error("No choices in LLM response");
    }

    const choice = response.choices[0];
    if (!choice || !choice.message) {
      console.error("   API Response:", JSON.stringify(response, null, 2));
      throw new Error("No message in LLM response choice");
    }

    // Check finish_reason to understand why content might be empty
    if (choice.finish_reason && choice.finish_reason !== "stop") {
      console.warn(`   Warning: finish_reason is "${choice.finish_reason}" (expected "stop")`);
    }

    const content = choice.message.content?.trim();
    
    if (!content) {
      console.error("   API Response:", JSON.stringify(response, null, 2));
      console.error("   Choice:", JSON.stringify(choice, null, 2));
      console.error(`   Finish reason: ${choice.finish_reason || "unknown"}`);
      throw new Error(`No content generated from LLM - content is empty or null (finish_reason: ${choice.finish_reason || "unknown"})`);
    }

    // Parse JSON response
    let parsed: { query: string; classNames: string[] };
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error("   Failed to parse JSON response:", content);
      throw new Error(`Invalid JSON response from LLM: ${parseError}`);
    }

    // Validate structure
    if (!parsed.query || typeof parsed.query !== "string") {
      throw new Error("LLM response missing or invalid 'query' field");
    }

    if (!parsed.classNames || !Array.isArray(parsed.classNames)) {
      throw new Error("LLM response missing or invalid 'classNames' field");
    }

    // Clean up the query (strip quotes if present)
    let query = parsed.query.trim();
    while (
      query &&
      ((query.startsWith('"') && query.endsWith('"')) ||
       (query.startsWith("'") && query.endsWith("'")) ||
       (query.startsWith("`") && query.endsWith("`")))
    ) {
      query = query.slice(1, -1).trim();
    }

    return {
      query,
      classNames: parsed.classNames.map((name) => name.trim()).filter((name) => name.length > 0),
    };
  } catch (error) {
    console.error("Error calling OpenAI:", error);
    throw error;
  }
}

async function main() {
  const args = process.argv.slice(2);

  // Parse --limit argument
  let limit = 10; // Default
  if (args.includes("--limit")) {
    const limitIndex = args.indexOf("--limit");
    const limitValue = args[limitIndex + 1];
    if (!limitValue || isNaN(parseInt(limitValue))) {
      console.error("Error: --limit requires a valid number");
      process.exit(1);
    }
    limit = parseInt(limitValue);
  }

  console.log(`\n🎯 Generating ${limit} default prompts...\n`);

  // Fetch all apps with their classes (without methods)
  console.log("📚 Fetching apps and classes from database...");
  const allApps = await prisma.app.findMany({
    include: {
      classes: {
        select: {
          id: true,
          name: true,
          description: true,
        },
      },
    },
  });

  // Filter apps that have at least one class
  const appsWithClasses = allApps.filter((app) => app.classes.length > 0);

  if (appsWithClasses.length < 2) {
    console.error("Error: Need at least 2 apps with classes in the database");
    process.exit(1);
  }

  console.log(`   Found ${appsWithClasses.length} apps with classes\n`);

  // Clear existing default prompts
  console.log("🧹 Clearing existing default prompts...");
  await prisma.defaultPrompt.deleteMany();
  console.log("   ✓ Cleared\n");

  const successfulPrompts: Array<{ prompt: string; classCount: number; apps: string[] }> = [];
  const failedAttempts: number[] = [];

  // Generate prompts
  for (let i = 0; i < limit; i++) {
    const promptNumber = i + 1;
    console.log(`📝 Generating prompt ${promptNumber}/${limit}...`);

    try {
      // Randomly sample 2 apps
      const selectedApps = sampleArray(appsWithClasses, 2);

      console.log(
        `   Selected apps: ${selectedApps.map((a) => a.name).join(", ")}`
      );
      console.log(
        `   Total classes available: ${selectedApps.reduce((sum, app) => sum + app.classes.length, 0)}`
      );

      // Generate prompt using LLM (returns query and class names)
      const { query, classNames } = await generatePrompt(selectedApps);

      console.log(`   LLM generated query: "${query}"`);
      console.log(`   LLM specified classes: ${classNames.join(", ")}`);

      // Map class names to class IDs
      // Create a map of all class names to IDs from the selected apps
      const classNameToId = new Map<string, string>();
      selectedApps.forEach((app) => {
        app.classes.forEach((cls) => {
          classNameToId.set(cls.name, cls.id);
        });
      });

      // Find matching class IDs
      const classIds: string[] = [];
      const notFoundClasses: string[] = [];

      classNames.forEach((className) => {
        const classId = classNameToId.get(className);
        if (classId) {
          classIds.push(classId);
        } else {
          notFoundClasses.push(className);
        }
      });

      if (notFoundClasses.length > 0) {
        console.warn(
          `   ⚠️  Warning: Could not find classes: ${notFoundClasses.join(", ")}`
        );
      }

      if (classIds.length === 0) {
        throw new Error(
          `No valid classes found. LLM specified: ${classNames.join(", ")}, but none matched the available classes.`
        );
      }

      // Save to database
      await prisma.defaultPrompt.create({
        data: {
          prompt: query,
          classIds: classIds,
        },
      });

      console.log(`   ✓ Saved with ${classIds.length} classes\n`);
      successfulPrompts.push({
        prompt: query,
        classCount: classIds.length,
        apps: selectedApps.map((a) => a.name),
      });
    } catch (error) {
      console.error(`   ✗ Failed to generate prompt ${promptNumber}:`, error);
      failedAttempts.push(promptNumber);
      console.log("");
    }
  }

  // Print summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`✓ Successful: ${successfulPrompts.length}/${limit}`);
  if (failedAttempts.length > 0) {
    console.log(`✗ Failed: ${failedAttempts.length} (attempts: ${failedAttempts.join(", ")})`);
  }
  
  if (successfulPrompts.length > 0) {
    console.log("\n📋 Generated Prompts:");
    console.log("-".repeat(60));
    successfulPrompts.forEach((item, index) => {
      console.log(`\n${index + 1}. [${item.classCount} classes from ${item.apps.join(" + ")}] ${item.prompt}`);
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

