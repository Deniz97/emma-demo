import { openai } from "./openai-client";
import { createReplSession } from "./repl/tools";
import { ReplSession } from "./repl/ReplSession";
import { getModel } from "./model-config";
import {
  LinesDto,
  ThoughtDto,
  ResultDto,
  ExecutionHistoryItem,
  ToolSelectorResult,
} from "@/types/tool-selector";
import { ChatMessage } from "@/types/chat";
import { prisma } from "./prisma";
import type { ChatCompletion } from "openai/resources/chat/completions";

/**
 * Prepares the initial context for the tool selection loop
 */
export async function prepare_initial_context(
  query: string
): Promise<{ systemPrompt: string; firstUserPrompt: string }> {
  // Fetch categories from database
  const categories = await prisma.category.findMany({
    select: {
      slug: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  // Deduplicate by slug (though they should already be unique)
  const uniqueCategories = Array.from(
    new Map(categories.map((cat) => [cat.slug, cat])).values()
  );

  // Format categories list
  const categoriesList = uniqueCategories
    .map((cat) => `\`${cat.slug}\` (${cat.name})`)
    .join(", ");

  const systemPrompt = `You are a tool selection assistant. Your job is to select 0-10 relevant tools (Method objects) from a pool of 100-200 available tools using META_TOOLS functions.

## Environment

You're working in a **persistent Node.js REPL**:
- Variables declared with \`var\` persist across all iterations
- You can build on previous work - don't recreate variables
- Each step builds on the last - REUSE what you've already created
- NEVER use \`const\` or \`let\` - they don't persist in REPL. Always use \`var\`.

## Available Categories

${categoriesList || "None available"}

## META_TOOLS Functions

You have access to these functions to explore and select tools:

1. **Search functions** (use uniform DTO pattern):
   - \`get_apps({ search_queries: string[], top: number, threshold?: number, categories?, apps?, classes?, methods? })\`
   - \`get_classes({ search_queries: string[], top: number, threshold?: number, categories?, apps?, classes?, methods? })\`
   - \`get_methods({ search_queries: string[], top: number, threshold?: number, categories?, apps?, classes?, methods? })\`
   - \`get_method_details({ search_queries: string[], top: number, threshold?: number, categories?, apps?, classes?, methods? })\`
   
   All search functions return arrays of objects with \`.slug\` fields.

2. **Verification functions** (LLM-powered Q&A):
   - \`ask_to_apps(slugs: string[], question: string)\` → \`{ yes: boolean, no: boolean, answer: string }\`
   - \`ask_to_classes(slugs: string[], question: string)\` → \`{ yes: boolean, no: boolean, answer: string }\`
   - \`ask_to_methods(slugs: string[], question: string)\` → \`{ yes: boolean, no: boolean, answer: string }\`
   
   Use these to verify capabilities before calling finish().

3. **Completion function** (REQUIRED):
   - \`finish(method_slugs: string[])\` - Call this to complete selection and return tools
   - Empty array is OK ONLY for conversational queries (greetings, thanks)
   - You MUST call this function to complete - no automatic completion

## Core Strategy

### 1. Use Multiple Synonyms (Critical!)
Always use 3-5 different search queries for the same concept:
- ❌ Bad: \`search_queries: ["APY"]\`
- ✅ Good: \`search_queries: ["APY", "yield", "interest rate", "annual percentage yield", "farming returns"]\`

### 2. Progressive Broadening IN SAME SCRIPT
Start specific, check results, immediately broaden if insufficient - all in ONE script:

\`\`\`javascript
var methods = await get_methods({ search_queries: ["specific", "terms", "here"], top: 5, threshold: 0.4 });
if (methods.length < 3) { 
  var m2 = await get_methods({ search_queries: ["broader", "terms"], top: 5, threshold: 0.3 }); 
  methods = [...methods, ...m2]; 
}
if (methods.length < 3) { 
  var m3 = await get_methods({ search_queries: ["even", "broader"], top: 8, threshold: 0.2 }); 
  methods = [...methods, ...m3]; 
}
\`\`\`

### 3. Verify Before Finishing
After gathering tools, verify they can actually do what's needed:

\`\`\`javascript
var slugs = [...new Set(methods.map(m => m.slug))];
if (slugs.length > 0) {
  var check = await ask_to_methods(slugs, "Can these provide X data?");
}
if (slugs.length > 0) {
  console.log("Verified:", check.yes, "- Answer:", check.answer);
}
if (slugs.length > 0 && check.yes) {
  await finish(slugs);
}
// If check.yes is false, DON'T call finish() - continue to step 2
\`\`\`

### 4. Length Checks Before finish()
NEVER call finish() with empty array in step 1 unless it's a conversational query:

\`\`\`javascript
// ✅ CORRECT - Check length first
if (slugs.length > 0) { await finish(slugs); }

// ❌ WRONG - Could finish with empty array
await finish(slugs);
\`\`\`

## Safety Rules

1. **Loop limits**: Use bounded loops only
   - ✅ \`for (var i = 0; i < searchTerms.length && results.length < 10; i++)\`
   - ❌ \`while (true)\` or \`while (results.length === 0)\`

2. **Max 30 META_TOOLS calls** per execution - exceeding this will abort with error

3. **Error handling**: If errors occur, FIX in next step
   - Use fallbacks: \`var x = methods || []\`
   - Try different search terms
   - Simplify code
   - DON'T just retry the same thing

## Step-by-Step Strategy

### Step 1: Specific + Verify
- Use 3-5 synonyms per concept
- Start with threshold 0.4, top 5
- Progressively broaden IN SAME SCRIPT if < 3 results
- Verify with ask_to_methods()
- If verification PASSES → call finish()
- If verification FAILS or 0 tools → DON'T call finish(), continue to step 2

### Step 2: Broader + Reuse
- REUSE variables from step 1 (don't recreate!)
- Add broader searches: \`methods = [...methods, ...broader]\`
- Use lower threshold (0.2-0.3), higher top (10-15)
- Generic terms: ["general", "common", "basic", "data"]
- Verify again
- If tools found → call finish()
- If still 0 tools → continue to step 3

### Step 3: Ultra-broad Fallback (FINAL)
- One simple, ultra-broad search
- REUSE all previous variables: \`methods = [...(methods || []), ...fallback]\`
- Very low threshold (0.15), high top (15-20)
- Generic queries: ["data", "api", "information"]
- Deduplicate and finish (MUST call finish() in step 3!)

\`\`\`javascript
var fallback = await get_methods({ search_queries: ["data", "api"], top: 15, threshold: 0.15 });
methods = [...(methods || []), ...fallback];
var final = [...new Set(methods.map(m => m.slug))];
await finish(final.slice(0, 10));
\`\`\`

## Response Format

You must respond with valid JSON in this exact format:

\`\`\`json
{
  "lines": [
    "var queries = [\\"query1\\", \\"query2\\", \\"query3\\"]",
    "var methods = await get_methods({ search_queries: queries, top: 5, threshold: 0.4 })",
    "if (methods.length < 3) { var m2 = await get_methods({ search_queries: [\\"broader\\"], top: 5, threshold: 0.3 }); methods = [...methods, ...m2] }",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these do X?\\"); if (check.yes) { await finish(slugs) } }"
  ],
  "thought": { "reasoning": "Start specific with multiple synonyms, broaden if needed, verify before finishing" }
}
\`\`\`

**Critical formatting rules:**
- Each element in "lines" array must be a COMPLETE, valid JavaScript statement
- **ONE statement per line** - split compound statements into separate lines for proper output capture
- Keep arrays on ONE line (don't split array literals across multiple "lines" elements)
- The "thought" field is JSON metadata only, NOT executable code
- Never include "thought" in the code itself

## Complete Examples

### Example 1: Step 1 with Progressive Broadening + Verification

\`\`\`json
{
  "lines": [
    "var apyQueries = [\\"highest APY\\", \\"yield farming\\", \\"annual percentage yield\\", \\"farming returns\\", \\"interest rate\\"]",
    "var methods = await get_methods({ search_queries: apyQueries, top: 5, threshold: 0.4 })",
    "console.log(\\"Initial search found:\\", methods.length, \\"methods\\")",
    "if (methods.length < 3) { var m2 = await get_methods({ search_queries: [\\"yield\\", \\"APY\\", \\"farming\\"], top: 5, threshold: 0.3 }); methods = [...methods, ...m2] }",
    "if (methods.length < 3) { console.log(\\"After broadening #1:\\", methods.length) }",
    "if (methods.length < 3) { var m3 = await get_methods({ search_queries: [\\"returns\\", \\"interest\\"], top: 8, threshold: 0.2 }); methods = [...methods, ...m3] }",
    "if (methods.length < 3) { console.log(\\"After broadening #2:\\", methods.length) }",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "console.log(\\"Unique tools found:\\", slugs.length)",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these provide high APY data for yield farming?\\") }",
    "if (slugs.length > 0) { console.log(\\"Verification result:\\", check.yes, \\"-\\", check.answer.substring(0, 100)) }",
    "if (slugs.length > 0 && check.yes) { await finish(slugs) }"
  ],
  "thought": { "reasoning": "Search with 5 synonyms for APY/yield concept, progressively broaden with lower thresholds if insufficient results, verify capabilities before finishing. If verification fails, don't finish - continue to step 2 where we can try different approaches." }
}
\`\`\`

### Example 2: Step 2 After Failed Verification

\`\`\`json
{
  "lines": [
    "console.log(\\"Step 2: Continuing with\\", (methods || []).length, \\"methods from step 1\\")",
    "var broader = await get_methods({ search_queries: [\\"cryptocurrency\\", \\"blockchain\\", \\"DeFi\\", \\"finance\\"], top: 10, threshold: 0.25 })",
    "console.log(\\"Broader search found:\\", broader.length, \\"additional methods\\")",
    "methods = [...(methods || []), ...broader]",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "console.log(\\"Total unique tools:\\", slugs.length)",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these provide yield/APY data?\\") }",
    "if (slugs.length > 0) { console.log(\\"Step 2 verification:\\", check.yes) }",
    "if (slugs.length > 0 && check.yes) { await finish(slugs.slice(0, 10)) }",
    "if (slugs.length > 0 && !check.yes) { await finish(slugs.slice(0, 5)) }"
  ],
  "thought": { "reasoning": "Reuse methods from step 1 (REPL persists variables!), add broader cryptocurrency/DeFi terms with lower threshold, verify again. Finish with top 10 if verified, or top 5 if still not perfect match." }
}
\`\`\`

### Example 3: Step 3 Ultra-broad Fallback

\`\`\`json
{
  "lines": [
    "console.log(\\"Step 3 (FINAL): Starting with\\", (methods || []).length, \\"methods from previous steps\\")",
    "var fallback = await get_methods({ search_queries: [\\"data\\", \\"api\\", \\"information\\"], top: 15, threshold: 0.15 })",
    "console.log(\\"Fallback search found:\\", fallback.length, \\"methods\\")",
    "methods = [...(methods || []), ...fallback]",
    "var final = [...new Set(methods.map(m => m.slug))]",
    "console.log(\\"Final unique tools:\\", final.length)",
    "await finish(final.slice(0, 10))"
  ],
  "thought": { "reasoning": "Final step - ultra-broad search with generic terms and very low threshold, combine with all previous results, deduplicate, take top 10. Must call finish() since this is the last step." }
}
\`\`\`

## Anti-patterns (NEVER DO THIS)

### ❌ Combining multiple statements on one line
\`\`\`json
{
  "lines": [
    "var check = await ask_to_methods(slugs, \"...\"); console.log(\"Result:\", check.yes); if (check.yes) { await finish(slugs) }"
  ]
}
\`\`\`
Problem: Multiple statements on one line can cause console.log output to be lost due to REPL output capture timing. Split into separate lines:
\`\`\`json
{
  "lines": [
    "var check = await ask_to_methods(slugs, \"...\")",
    "console.log(\"Result:\", check.yes)",
    "if (check.yes) { await finish(slugs) }"
  ]
}
\`\`\`

### ❌ Splitting arrays across lines
\`\`\`json
{
  "lines": [
    "await finish([",
    "  ...methods.map(m => m.slug)",
    "])"
  ]
}
\`\`\`
Problem: Creates syntax errors when executed line by line!

### ❌ Finishing with 0 tools in step 1
\`\`\`json
{
  "lines": [
    "var m = await get_methods({ search_queries: [\\"price\\"], top: 5 })",
    "await finish(m.map(x => x.slug))"
  ]
}
\`\`\`
Problem: If m is empty, this calls finish([])! Must check length first.

### ❌ Finishing when verification fails
\`\`\`json
{
  "lines": [
    "var check = await ask_to_methods(slugs, \\"Can these do X?\\");",
    "await finish(check.yes ? slugs : [])"
  ]
}
\`\`\`
Problem: Calls finish([]) when verification fails! Should not call finish() at all - let it continue to step 2.

### ❌ Infinite loops
\`\`\`json
{
  "lines": ["while (methods.length === 0) { methods = await get_methods({...}) }"]
}
\`\`\`
Problem: Loops forever if results are always empty! Use bounded for loops instead.

Remember: You're building a multi-step exploration. Each step builds on the last. Be thorough but safe!`;

  const firstUserPrompt = `Query: "${query}"

Your task: Find relevant tools (Method objects) for this query.

## Step 1 Instructions

Generate JavaScript code that:

1. **Searches with multiple synonyms** (3-5 different ways to express the same concept)
   - Example: Instead of just "NFT", use ["NFT", "non-fungible token", "crypto art", "digital collectible", "blockchain token"]

2. **Progressively broadens IN SAME SCRIPT** if results are insufficient
   - Check \`methods.length\` after each search
   - If < 3 results, immediately do another search with broader terms and lower threshold
   - Example:
     \`\`\`javascript
     var methods = await get_methods({ search_queries: ["specific", "terms"], top: 5, threshold: 0.4 });
     if (methods.length < 3) { 
       var m2 = await get_methods({ search_queries: ["broader", "terms"], top: 5, threshold: 0.3 }); 
       methods = [...methods, ...m2]; 
     }
     \`\`\`

3. **Verifies capabilities** with ask_to_methods()
   - Extract unique slugs: \`var slugs = [...new Set(methods.map(m => m.slug))]\`
   - Ask a specific question: \`var check = await ask_to_methods(slugs, "Can these do X?")\`
   - Check the \`check.yes\` field to see if verification passed

4. **Finishes ONLY if verification passes**
   - \`if (check.yes) { await finish(slugs) }\`
   - If \`check.yes\` is false, DON'T call finish() - let it continue to step 2
   - ALWAYS check \`slugs.length > 0\` before calling finish()

5. **Uses safe, bounded loops**
   - ✅ \`for (var i = 0; i < array.length; i++)\`
   - ❌ \`while (true)\` or \`while (results.length === 0)\`

6. **Logs smart summaries** (not full objects)
   - ✅ \`console.log("Found:", methods.length, "methods")\`
   - ✅ \`console.log("Slugs:", slugs)\`
   - ❌ \`console.log(methods)\` (wastes tokens)

## Response Format

Return valid JSON with this structure:

\`\`\`json
{
  "lines": [
    "var queries = [\\"synonym1\\", \\"synonym2\\", \\"synonym3\\", \\"synonym4\\"]",
    "var methods = await get_methods({ search_queries: queries, top: 5, threshold: 0.4 })",
    "console.log(\\"Initial search:\\", methods.length, \\"methods\\")",
    "if (methods.length < 3) { var m2 = await get_methods({ search_queries: [\\"broader1\\", \\"broader2\\"], top: 5, threshold: 0.3 }); methods = [...methods, ...m2] }",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these provide X data?\\") }",
    "if (slugs.length > 0) { console.log(\\"Verified:\\", check.yes) }",
    "if (slugs.length > 0 && check.yes) { await finish(slugs) }"
  ],
  "thought": { "reasoning": "Your step-by-step reasoning about the search strategy" }
}
\`\`\`

Remember:
- Each "lines" element must be a COMPLETE JavaScript statement
- **ONE statement per line** - split compound statements (multiple statements with semicolons) into separate lines
- Keep arrays on ONE line (don't split array literals across elements)
- Aim to finish in step 1 if verification passes
- If verification fails or you find 0 tools, DON'T call finish() - the system will continue to step 2
- Stay within 30 META_TOOLS calls total
- Use \`var\` for all variables (REPL persistence)`;

  return { systemPrompt, firstUserPrompt };
}

/**
 * Generates the next code lines and thought using OpenAI
 */
export async function generate_next_script(
  systemPrompt: string,
  firstUserPrompt: string,
  executionHistory: ExecutionHistoryItem[],
  currentStep: number,
  maxSteps: number
): Promise<{ lines: LinesDto; thought: ThoughtDto }> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: firstUserPrompt },
  ];

  // Add execution history as context
  // No truncation limits - let the LLM decide what to output based on prompts and guidelines
  for (const item of executionHistory) {
    // Format the REPL outputs (no truncation - trust LLM's smart logging)
    const replOutputs = item.result.outputs
      .map((output) => {
        let formatted = output.formattedOutput;

        // Remove code echo lines (lines starting with '>', '...', or echoed code)
        const lines = formatted.split("\n");
        const resultLines = lines.filter((line) => {
          const trimmed = line.trim();
          // Skip empty lines
          if (!trimmed) return false;
          // Skip REPL prompt lines (starting with '>' or '...')
          if (trimmed.startsWith(">") || trimmed.startsWith("..."))
            return false;
          // Skip standalone "undefined"
          if (trimmed === "undefined") return false;
          // Keep error lines
          if (trimmed.includes("Error") || trimmed.includes("Uncaught"))
            return true;
          // Keep everything else (console.log output, return values)
          return true;
        });
        formatted = resultLines.join("\n").trim();

        // If empty after filtering, use a summary instead
        if (!formatted || formatted === "undefined") {
          formatted = "(No output)";
        }

        // No truncation - let the LLM control output through smart logging guidelines
        return formatted;
      })
      .filter((output) => output && output !== "(No output)") // Remove empty outputs
      .join("\n\n");

    // No truncation limit - trust the LLM to be selective based on guidelines
    const finalReplOutputs = replOutputs || "(No output)";

    messages.push({
      role: "assistant",
      content: `Lines executed:
${item.lines.lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

Thought: ${JSON.stringify(item.thought)}

REPL Output:
${finalReplOutputs}`,
    });
    const stepGuidance =
      executionHistory.length === 1
        ? "**STEP 2**: Variables from step 1 exist! Reuse them: \`methods = [...methods, ...broader]\`. Broader terms, lower threshold (0.2), higher top (10-15)."
        : executionHistory.length === 2
          ? '**STEP 3 (FINAL)**: One ultra-broad search: \`var fallback = await get_methods({ search_queries: ["data", "api"], top: 15, threshold: 0.15 }); methods = [...(methods || []), ...fallback]; await finish([...new Set(methods.map(m => m.slug))].slice(0, 10))\`. MUST call finish()!'
          : "Continue exploring.";

    const errorGuidance = item.result.outputs.some((o) => o.error)
      ? "⚠️ **ERRORS**: FIX don't redo! Use fallbacks: \`var x = methods || []\`, different approach, simpler code.\n\n"
      : "";

    messages.push({
      role: "user",
      content: `${errorGuidance}Review results:\n1. Check lengths - retry if empty/few\n2. ${stepGuidance}\n3. **CRITICAL**: If you found tools, return them! NEVER \`finish([])\` if you have results\n4. **Before finish()**: \`if (slugs.length > 0) { await finish(slugs) }\` - if 0 in step 1, continue to step 2\n\nBe creative but safe (max 30 calls, safe loops, length checks).`,
    });
  }

  // On the last step, add a special instruction to make final decision
  if (currentStep === maxSteps) {
    messages.push({
      role: "user",
      content:
        "🚨 FINAL STEP (3/3): MUST call finish() now with your method slugs. Ultra-simple: add broad search to existing, deduplicate, finish.",
    });
  }

  // Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
  // Note: GPT-5 models may use reasoning tokens, so actual usage may be higher
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);

  console.log(
    `[tool-selector] Step ${executionHistory.length + 1}: LLM call (~${estimatedTokens} tokens)`
  );

  // No hard limits - just informational logging
  // Trust the LLM to manage context through smart logging guidelines

  try {
    const model = getModel("toolSelector");
    const response = await openai.chat.completions.create(
      {
        model,
        messages,
        response_format: { type: "json_object" },
      },
      {
        // GPT-5 models may use reasoning tokens which can take longer
        // Increased timeout to accommodate reasoning and large contexts
        timeout: 180000, // 180 second timeout (3 minutes) - increased for GPT-5 reasoning tokens
      }
    );

    console.log(
      `[tool-selector] Step ${executionHistory.length + 1}: Response (${response.usage?.total_tokens || "?"} tokens)`
    );

    return parseOpenAIResponse(response);
  } catch (error) {
    console.error(
      `[tool-selector] OpenAI call failed:`,
      error instanceof Error ? error.message : String(error)
    );
    console.error(`[tool-selector] Full error:`, error);
    // Return empty lines - the loop will continue or hit max steps
    return {
      lines: { lines: [] },
      thought: {
        reasoning: `OpenAI call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    };
  }
}

/**
 * Parse OpenAI response into lines and thought
 */
function parseOpenAIResponse(response: ChatCompletion): {
  lines: LinesDto;
  thought: ThoughtDto;
} {
  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error("[tool-selector] No content in response");
    return {
      lines: { lines: [] },
      thought: { reasoning: "No response from OpenAI" },
    };
  }

  try {
    const parsed = JSON.parse(content);
    const lines: LinesDto = {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
    const thought: ThoughtDto = {
      reasoning: parsed.thought?.reasoning || undefined,
    };

    if (lines.lines.length === 0) {
      console.warn("[tool-selector] ⚠ LLM returned 0 lines of code");
    }

    return { lines, thought };
  } catch (error) {
    console.error("[tool-selector] Failed to parse response:", error);
    return {
      lines: { lines: [] },
      thought: { reasoning: "Failed to parse OpenAI response" },
    };
  }
}

/**
 * Executes code lines in the REPL session
 */
async function executeLines(
  session: ReplSession,
  lines: string[]
): Promise<ResultDto> {
  try {
    const outputs = await session.runLines(lines);
    const errors = outputs.filter((o) => o.error);

    if (errors.length > 0) {
      errors.forEach((output) => {
        console.error(`[tool-selector] ✗ ${output.error}`);
      });
    }

    return {
      success: true,
      outputs,
    };
  } catch (error) {
    console.error(
      "[tool-selector] ✗ Execution failed:",
      error instanceof Error ? error.message : String(error)
    );
    return {
      success: false,
      outputs: [],
    };
  }
}

/**
 * Main function that implements the iterative tool selection loop
 */
export async function selectTools(
  query: string,
  chatHistory: ChatMessage[],
  maxSteps: number = 3,
  onStepChange?: (step: string) => Promise<void>
): Promise<ToolSelectorResult> {
  console.log(
    `[tool-selector] Starting tool selection for query: "${query.substring(0, 60)}${query.length > 60 ? "..." : ""}"`
  );

  // Step 1: Analyzing query
  if (onStepChange) {
    await onStepChange("Analyzing query...");
  }

  const { systemPrompt, firstUserPrompt } =
    await prepare_initial_context(query);

  const session = createReplSession();
  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;

    // Step 2: Selecting tools (generating code)
    if (onStepChange) {
      await onStepChange(`Selecting Tools ${step}/${maxSteps}`);
    }

    // Generate next lines and thought
    const { lines, thought } = await generate_next_script(
      systemPrompt,
      firstUserPrompt,
      executionHistory,
      step,
      maxSteps
    );

    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: ${thought.reasoning?.substring(0, 80) || "No reasoning"}...`
    );

    // Step 3: Exploring tools (executing code)
    if (onStepChange && lines.lines.length > 0) {
      await onStepChange("Exploring tools...");
    }

    // Check if finish() was already called (before running new lines)
    let finishResult = session.getFinishResult();
    if (finishResult !== null) {
      console.log(
        `[tool-selector] Step ${step}/${maxSteps}: ✓ finish() called with ${finishResult.length} tool(s)`
      );

      // Don't execute new lines, just return with existing finish result
      const methods =
        finishResult.length > 0
          ? await prisma.method.findMany({
              where: {
                slug: {
                  in: finishResult,
                },
              },
              include: {
                class: {
                  include: {
                    app: true,
                  },
                },
              },
            })
          : [];

      return {
        tools: methods.map((m) => ({
          id: m.id,
          classId: m.classId,
          name: m.name,
          path: m.path,
          httpVerb: m.httpVerb,
          description: m.description,
          arguments: m.arguments as Array<{
            name: string;
            type: string;
            description: string;
          }>,
          returnType: m.returnType,
          returnDescription: m.returnDescription,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        reasoning:
          executionHistory[executionHistory.length - 1]?.thought?.reasoning,
        debugData: {
          systemPrompt,
          userPrompt: firstUserPrompt,
          executionHistory: executionHistory.map((item, idx) => ({
            step: idx + 1,
            lines: item.lines.lines,
            thought: item.thought,
            result: item.result,
            finishMethodSlugs: item.finishMethodSlugs,
          })),
        },
      };
    }

    // Execute the lines in the persistent REPL session
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Executing ${lines.lines.length} line(s):`
    );
    lines.lines.forEach((line, idx) => {
      console.log(
        `  ${idx + 1}: ${line.substring(0, 120)}${line.length > 120 ? "..." : ""}`
      );
    });

    const result = await executeLines(session, lines.lines);

    // Wait a bit for IPC messages to be processed (finish() uses IPC, not stdout)
    // This ensures finish() calls are detected before we check the result
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if finish() was called during this execution
    finishResult = session.getFinishResult();
    if (finishResult !== null) {
      const toolSlugs = finishResult;
      console.log(
        `[tool-selector] Step ${step}/${maxSteps}: ✓ finish([${toolSlugs.length} tools])`
      );

      // Add the final step to execution history
      const finalStepHistory = [
        ...executionHistory,
        {
          lines,
          thought,
          result,
          finishMethodSlugs: toolSlugs,
        },
      ];

      // Fetch Method objects by slugs (if any)
      const methods =
        toolSlugs.length > 0
          ? await prisma.method.findMany({
              where: {
                slug: {
                  in: toolSlugs,
                },
              },
              include: {
                class: {
                  include: {
                    app: true,
                  },
                },
              },
            })
          : [];

      return {
        tools: methods.map((m) => ({
          id: m.id,
          classId: m.classId,
          name: m.name,
          path: m.path,
          httpVerb: m.httpVerb,
          description: m.description,
          arguments: m.arguments as Array<{
            name: string;
            type: string;
            description: string;
          }>,
          returnType: m.returnType,
          returnDescription: m.returnDescription,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        reasoning: thought.reasoning,
        debugData: {
          systemPrompt,
          userPrompt: firstUserPrompt,
          executionHistory: finalStepHistory.map((item, idx) => ({
            step: idx + 1,
            lines: item.lines.lines,
            thought: item.thought,
            result: item.result,
            finishMethodSlugs: item.finishMethodSlugs,
          })),
        },
      };
    }

    // Log execution result
    const errorCount = result.outputs.filter((o) => o.error).length;
    const successCount = result.outputs.length - errorCount;
    if (errorCount > 0) {
      console.log(
        `[tool-selector] Step ${step}/${maxSteps}: Result: ${successCount} ok, ${errorCount} errors`
      );
    } else {
      console.log(
        `[tool-selector] Step ${step}/${maxSteps}: Result: ${result.outputs.length} ok`
      );
    }

    // Append to execution history
    executionHistory.push({
      lines,
      thought,
      result,
    });
  }

  // If we've exhausted max steps, return empty result
  console.log(`[tool-selector] Max steps reached without finding tools`);

  return {
    tools: [],
    reasoning: "Max steps reached without finding tools",
    debugData: {
      systemPrompt,
      userPrompt: firstUserPrompt,
      executionHistory: executionHistory.map((item, idx) => ({
        step: idx + 1,
        lines: item.lines.lines,
        thought: item.thought,
        result: item.result,
      })),
    },
  };
}
