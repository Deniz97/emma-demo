#!/usr/bin/env tsx

/**
 * Script to generate default prompts for the chat interface
 * 
 * Usage:
 *   tsx scripts/generate-default-prompts.ts --limit 10
 *   tsx scripts/generate-default-prompts.ts --limit 20
 * 
 * This script:
 * - Randomly samples 2-4 classes from the database
 * - Uses LLM to generate realistic queries that would require multiple tools
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
 * Generates a single default prompt using LLM
 */
async function generatePrompt(
  classes: Array<{
    id: string;
    name: string;
    description: string | null;
    methods: Array<{ name: string; description: string | null }>;
    app: { name: string; description: string | null };
  }>
): Promise<string> {
  // Build the class information for the LLM
  const classInfo = classes.map((cls) => {
    const methodList = cls.methods
      .slice(0, 5) // Show up to 5 methods per class
      .map((m) => `    - ${m.name}${m.description ? `: ${m.description}` : ""}`)
      .join("\n");
    
    return `- **${cls.name}** (from ${cls.app.name})
  ${cls.description || "No description"}
  Available methods:
${methodList}`;
  }).join("\n\n");

  const systemPrompt = `You are an AI assistant that generates realistic user queries for a cryptocurrency data API chatbot.
Given a set of API classes and their methods, generate a natural, realistic question that a user might ask that would require fetching data from multiple of these classes' methods.

The query should:
- Sound natural and conversational
- Be specific enough to require actual data fetching
- Cover multiple classes (not just one)
- Be something a real user interested in cryptocurrency would ask

Return ONLY the user query text, no explanation or extra formatting.`;

  const userPrompt = `Given these API classes and their available methods:

${classInfo}

Generate a realistic user query that would require fetching data from multiple of these classes. The query should sound natural and be something a real cryptocurrency enthusiast might ask.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.9, // Higher temperature for more variety
      max_tokens: 200,
    });

    let generatedPrompt = response.choices[0]?.message?.content?.trim();
    
    if (!generatedPrompt) {
      throw new Error("No prompt generated from LLM");
    }

    // Strip surrounding quotation marks if present (handles both single and double quotes)
    // Also handles cases where there might be multiple layers of quotes
    while (
      generatedPrompt &&
      ((generatedPrompt.startsWith('"') && generatedPrompt.endsWith('"')) ||
       (generatedPrompt.startsWith("'") && generatedPrompt.endsWith("'")) ||
       (generatedPrompt.startsWith("`") && generatedPrompt.endsWith("`")))
    ) {
      generatedPrompt = generatedPrompt.slice(1, -1).trim();
    }

    return generatedPrompt;
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

  // Fetch all classes with their methods and app info
  console.log("📚 Fetching classes and methods from database...");
  const allClasses = await prisma.class.findMany({
    include: {
      methods: {
        select: {
          name: true,
          description: true,
        },
      },
      app: {
        select: {
          name: true,
          description: true,
        },
      },
    },
  });

  // Filter classes that have at least one method
  const classesWithMethods = allClasses.filter((cls) => cls.methods.length > 0);

  if (classesWithMethods.length < 2) {
    console.error("Error: Need at least 2 classes with methods in the database");
    process.exit(1);
  }

  console.log(`   Found ${classesWithMethods.length} classes with methods\n`);

  // Clear existing default prompts
  console.log("🧹 Clearing existing default prompts...");
  await prisma.defaultPrompt.deleteMany();
  console.log("   ✓ Cleared\n");

  const successfulPrompts: Array<{ prompt: string; classCount: number }> = [];
  const failedAttempts: number[] = [];

  // Generate prompts
  for (let i = 0; i < limit; i++) {
    const promptNumber = i + 1;
    console.log(`📝 Generating prompt ${promptNumber}/${limit}...`);

    try {
      // Randomly sample 2-4 classes
      const classCount = Math.floor(Math.random() * 3) + 2; // 2, 3, or 4
      const selectedClasses = sampleArray(classesWithMethods, classCount);

      console.log(
        `   Selected ${selectedClasses.length} classes: ${selectedClasses
          .map((c) => c.name)
          .join(", ")}`
      );

      // Generate prompt using LLM
      const generatedPrompt = await generatePrompt(selectedClasses);

      // Save to database
      await prisma.defaultPrompt.create({
        data: {
          prompt: generatedPrompt,
          classIds: selectedClasses.map((c) => c.id),
        },
      });

      console.log(`   ✓ Generated: "${generatedPrompt}"\n`);
      successfulPrompts.push({ prompt: generatedPrompt, classCount: selectedClasses.length });
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
      console.log(`\n${index + 1}. [${item.classCount} classes] ${item.prompt}`);
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

