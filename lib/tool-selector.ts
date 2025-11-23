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

  // Debug: Log categories
  console.log(
    `[tool-selector] DEBUG - Categories loaded: ${uniqueCategories.length} categories`
  );
  console.log(
    `[tool-selector] DEBUG - Categories list: ${categoriesList.substring(0, 200)}...`
  );

  const systemPrompt = `You are a tool selection assistant. Select 0-10 relevant tools from 100-200 available using META_TOOLS.

**Environment**: Persistent Node.js REPL (variables persist across iterations). Use \`var\`, never \`const\`/\`let\`.

**Categories**: ${categoriesList || "None"}

**META_TOOLS**:
- \`get_apps/classes/methods(dto)\` - Search tools with: \`{ search_queries: string[], top: number, threshold?: number, categories?, apps?, classes?, methods? }\`
- \`ask_to_apps/classes/methods(slugs[], question)\` - Verify capabilities, returns \`{ yes, no, answer }\`
- \`finish(method_slugs[])\` - REQUIRED to complete. Empty array OK for greetings/thanks.

**Core Principles**:
1. **Multiple synonyms**: Always use 3-5 search queries: \`["APY", "yield", "interest rate", "farming", "returns"]\`
2. **Progressive broadening IN SAME SCRIPT**: Start specific, check length, immediately broaden if insufficient - all in one script
3. **Use ask_* for verification**: After gathering tools, use \`ask_to_methods(slugs, "question")\` to verify capabilities
4. **Verification-based finishing**: If verification PASSES (\`check.yes\`), call \`finish(slugs)\`. If FAILS, DON'T finish - continue to step 2 with state preserved

**CRITICAL SAFETY**:
- **Loop limits**: Use \`for (var i = 0; i < array.length; i++)\` NOT \`while (true)\` or \`while (results.length === 0)\`
- **Max 30 META_TOOLS calls** per execution - exceeding aborts with error
- **finish() check**: \`if (uniqueSlugs.length > 0) { await finish(uniqueSlugs) }\` - if 0 in step 1, DON'T call finish()

**Step Strategy**:
- **Step 1**: Specific searches with multiple synonyms, progressive fallback. If 0 tools, continue to step 2.
- **Step 2**: REUSE step 1 variables (REPL persists!), add broader searches: \`methods = [...methods, ...broader]\`
  - Lower threshold (0.2-0.3), higher top (10-15), generic terms: \`["general", "common", "basic"]\`
- **Step 3**: Ultra-simple fallback - one broad search, add to existing, finish: \`var fallback = await get_methods({ search_queries: ["data", "api"], top: 15, threshold: 0.15 }); methods = [...(methods || []), ...fallback]; await finish([...new Set(methods.map(m => m.slug))].slice(0, 10))\`

**Error Handling**: If errors occur, FIX in next step - use fallbacks (\`var x = methods || []\`), different approach, simpler code. DON'T redo same thing.

**Response Format**:
\`\`\`json
{
  "lines": ["var m = await get_methods({...})", "await finish(m.map(x => x.slug))"],
  "thought": { "reasoning": "your reasoning" }
}
\`\`\`
Each "lines" element must be complete, valid JavaScript. Keep arrays on ONE line. "thought" is JSON metadata, NOT code.

**Examples**:

Good - Progressive broadening with verification (step 1):
\`\`\`json
{
  "lines": [
    "var queries = [\\"highest APY\\", \\"yield farming\\", \\"interest rate\\", \\"farming returns\\"]",
    "var methods = await get_methods({ search_queries: queries, top: 5, threshold: 0.4 })",
    "if (methods.length < 3) { var m2 = await get_methods({ search_queries: [\\"yield\\", \\"APY\\"], top: 5, threshold: 0.3 }); methods = [...methods, ...m2] }",
    "if (methods.length < 3) { var m3 = await get_methods({ search_queries: [\\"farming\\", \\"returns\\"], top: 8, threshold: 0.2 }); methods = [...methods, ...m3] }",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these provide high APY data?\\"); console.log(\\"Found:\\", slugs.length, \\"tools, verified:\\", check.yes); if (check.yes) { await finish(slugs) } }"
  ],
  "thought": { "reasoning": "Start specific, progressively broaden if insufficient, verify. If verification passes, finish. If fails or 0 tools, continue to step 2 with state preserved" }
}
\`\`\`

Good - Step 2 continuing after failed verification:
\`\`\`json
{
  "lines": [
    "console.log(\\"Step 2: Found\\", (methods || []).length, \\"methods in step 1, but verification failed\\")",
    "var broader = await get_methods({ search_queries: [\\"general\\", \\"common\\", \\"data\\"], top: 10, threshold: 0.2 })",
    "methods = [...(methods || []), ...broader]",
    "var slugs = [...new Set(methods.map(m => m.slug))]",
    "if (slugs.length > 0) { var check = await ask_to_methods(slugs, \\"Can these provide the data we need?\\"); if (check.yes) { await finish(slugs.slice(0, 10)) } else { await finish(slugs.slice(0, 5)) } }"
  ],
  "thought": { "reasoning": "Reuse methods from step 1, add broader search, verify again. Finish with subset if verification still fails, full set if passes" }
}
\`\`\`

Bad - Infinite loop:
\`\`\`json
{
  "lines": ["while (methods.length === 0) { methods = await get_methods({...}) }"]
}
\`\`\`
Problem: Loops forever if always empty! Use \`for (var i = 0; i < 5; i++)\` instead.

Bad - Finish with 0 tools in step 1:
\`\`\`json
{
  "lines": ["var m = await get_methods({...})", "await finish(m.map(x => x.slug))"]
}
\`\`\`
Problem: If m is empty, finishes with 0 tools! Use \`if (slugs.length > 0)\` check.

Bad - Finishing when verification fails:
\`\`\`json
{
  "lines": [
    "var methods = await get_methods({...})",
    "var slugs = methods.map(m => m.slug)",
    "var check = await ask_to_methods(slugs, \\"Can these do X?\\"); await finish(check.yes ? slugs : [])"
  ]
}
\`\`\`
Problem: Calls finish([]) when verification fails! Should NOT call finish() - let it continue to step 2 where state is preserved and different approaches can be tried.`;

  const firstUserPrompt = `Query: "${query}"

Generate JavaScript code to find relevant tools:
1. Use 3-5 synonyms per search: \`search_queries: ["APY", "yield", "interest rate", "farming", "returns"]\`
2. **Progressive broadening IN SAME SCRIPT**: Check length after each search, immediately broaden if < 3 results
   - Example: \`if (methods.length < 3) { var m2 = await get_methods({...broader...}); methods = [...methods, ...m2] }\`
3. **Verify with ask_***: After gathering tools, use \`ask_to_methods(slugs, "Can these do X?")\` to verify
4. **Finish only if verified**: \`if (check.yes) { await finish(slugs) }\` - If verification fails, DON'T finish, continue to step 2
5. Use safe loops: \`for (var i = 0; i < array.length; i++)\` NOT \`while (true)\`

Return JSON: \`{ "lines": ["code1", "code2"], "thought": { "reasoning": "..." } }\`

Be creative, aim to finish in step 1 with verification passing, but stay within 30 META_TOOLS calls. If verification fails or 0 tools, continue to step 2 (state preserved).`;

  // Debug: Log the prompts
  console.log(
    `[tool-selector] DEBUG - System prompt length: ${systemPrompt.length} chars`
  );
  console.log(
    `[tool-selector] DEBUG - System prompt (first 500 chars):\n${systemPrompt.substring(0, 500)}`
  );
  console.log(`[tool-selector] DEBUG - First user prompt:\n${firstUserPrompt}`);

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
    `[tool-selector] Calling OpenAI for iteration ${executionHistory.length + 1}...`
  );
  console.log(
    `[tool-selector] Context size: ~${estimatedTokens} tokens (${totalChars} chars, ${messages.length} messages)`
  );

  // Debug: Log the full messages being sent (truncated for readability)
  console.log(`[tool-selector] DEBUG - Messages being sent to LLM:`);
  messages.forEach((msg, idx) => {
    const preview = msg.content.substring(0, 300);
    console.log(
      `[tool-selector]   Message ${idx + 1} (${msg.role}): ${preview}${msg.content.length > 300 ? "..." : ""}`
    );
  });

  // No hard limits - just informational logging
  // Trust the LLM to manage context through smart logging guidelines

  try {
    const model = getModel("toolSelector");
    console.log(`[tool-selector] DEBUG - Calling model: ${model}`);
    console.log(`[tool-selector] DEBUG - Using response_format: json_object`);

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

    console.log(`[tool-selector] OpenAI response received`);
    console.log(
      `[tool-selector] DEBUG - Response choice count: ${response.choices.length}`
    );
    console.log(
      `[tool-selector] DEBUG - Finish reason: ${response.choices[0]?.finish_reason}`
    );
    console.log(`[tool-selector] DEBUG - Usage:`, response.usage);

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
    console.error("[tool-selector] No content in OpenAI response");
    return {
      lines: { lines: [] },
      thought: { reasoning: "No response from OpenAI" },
    };
  }

  // Debug: Log the raw response content
  console.log(
    "[tool-selector] Raw LLM response content:",
    content.substring(0, 1000)
  );

  try {
    const parsed = JSON.parse(content);

    // Debug: Log the parsed structure
    console.log(
      "[tool-selector] Parsed JSON structure:",
      JSON.stringify({
        hasLines: !!parsed.lines,
        linesType: Array.isArray(parsed.lines) ? "array" : typeof parsed.lines,
        linesCount: Array.isArray(parsed.lines) ? parsed.lines.length : 0,
        hasThought: !!parsed.thought,
        thoughtKeys: parsed.thought ? Object.keys(parsed.thought) : [],
      })
    );

    const lines: LinesDto = {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
    const thought: ThoughtDto = {
      reasoning: parsed.thought?.reasoning || undefined,
    };

    // Debug: Log what we're returning
    console.log(
      "[tool-selector] Parsed result: lines =",
      lines.lines.length,
      "thought =",
      thought.reasoning?.substring(0, 100)
    );

    // Debug: If lines is empty, check if there was any code-like content in the response
    if (lines.lines.length === 0) {
      console.warn(
        "[tool-selector] ⚠️  WARNING: LLM returned 0 lines of code!"
      );
      console.warn("[tool-selector] ⚠️  Thought reasoning:", thought.reasoning);
      console.warn(
        "[tool-selector] ⚠️  This suggests the LLM is not generating executable code."
      );

      // Check if the parsed object has any other fields that might contain code
      const otherKeys = Object.keys(parsed).filter(
        (k) => k !== "lines" && k !== "thought"
      );
      if (otherKeys.length > 0) {
        console.warn("[tool-selector] ⚠️  Other keys in response:", otherKeys);
        otherKeys.forEach((key) => {
          console.warn(
            `[tool-selector] ⚠️  ${key}:`,
            JSON.stringify(parsed[key]).substring(0, 200)
          );
        });
      }
    }

    return { lines, thought };
  } catch (error) {
    console.error("[tool-selector] Failed to parse OpenAI response:", error);
    console.error(
      "[tool-selector] Response content:",
      content.substring(0, 500)
    );
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

    // Log detailed error information
    const errors = outputs.filter((o) => o.error);
    if (errors.length > 0) {
      console.error(`[tool-selector] ${errors.length} error(s) in execution:`);
      errors.forEach((output, idx) => {
        console.error(`[tool-selector] Error ${idx + 1}:`, output.error);
        if (output.formattedOutput) {
          console.error(
            `[tool-selector] Error ${idx + 1} output:`,
            output.formattedOutput
          );
        }
      });
    }

    return {
      success: true,
      outputs,
    };
  } catch (error) {
    console.error(
      "[tool-selector] Execution failed:",
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
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Generating exploration code...`
    );

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

    // Debug: Log the thought/reasoning for this step
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Thought/reasoning:`,
      thought.reasoning || "(none)"
    );

    // Step 3: Exploring tools (executing code)
    if (onStepChange && lines.lines.length > 0) {
      await onStepChange("Exploring tools...");
    }

    // Check if finish() was already called (before running new lines)
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Checking for early termination...`
    );
    let finishResult = session.getFinishResult();
    if (finishResult !== null) {
      console.log(
        `[tool-selector] ✓ Tool selection complete: finish() was called in previous step with ${finishResult.length} tool(s)`
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
      `[tool-selector] Step ${step}/${maxSteps}: Executing ${lines.lines.length} line(s) of code...`
    );
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Code to execute:`);
    lines.lines.forEach((line, idx) => {
      console.log(`  ${idx + 1}: ${line}`);
    });

    const result = await executeLines(session, lines.lines);

    // Wait a bit for IPC messages to be processed (finish() uses IPC, not stdout)
    // This ensures finish() calls are detected before we check the result
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if finish() was called during this execution
    finishResult = session.getFinishResult();
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Checking finish result:`,
      finishResult
    );
    if (finishResult !== null) {
      const toolSlugs = finishResult;
      console.log(
        `[tool-selector] ✓ Tool selection complete: finish() called with ${toolSlugs.length} tool(s) in ${step} step(s)`
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

    if (result.success) {
      const errorCount = result.outputs.filter((o) => o.error).length;
      if (errorCount > 0) {
        console.error(
          `[tool-selector] Step ${step}/${maxSteps}: ⚠ ${errorCount} error(s) during execution`
        );
        // Log each error with details
        result.outputs.forEach((output, idx) => {
          if (output.error) {
            console.error(
              `[tool-selector] Step ${step}/${maxSteps} - Error ${idx + 1}:`,
              output.error
            );
          }
        });
      } else {
        console.log(
          `[tool-selector] Step ${step}/${maxSteps}: ✓ Execution complete`
        );
      }
    } else {
      console.error(
        `[tool-selector] Step ${step}/${maxSteps}: ✗ Execution failed`
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
