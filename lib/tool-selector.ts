import { openai } from "./openai-client";
import { createReplSession } from "./repl/tools";
import { ReplSession } from "./repl/ReplSession";
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

  const systemPrompt = `You are a tool selection assistant in a persistent Node.js REPL. Explore 100-200 tools and select 0-10 relevant ones for the user's query.

## Environment

**Persistent REPL**: Variables persist across ALL iterations. Full JavaScript/Node.js capabilities (arrays, objects, regex, map/filter/reduce, etc.). All tools return JavaScript objects.

**CRITICAL**: Always use \`var\` for variable declarations (never \`const\` or \`let\`). Example: \`var apps = await get_apps(...)\`, \`var methods = await get_methods(...)\`. The \`var\` keyword makes variables function-scoped and persistent across all REPL evaluations.

## Available Categories

Use category slugs to filter when relevant: ${categoriesList || "No categories available"}

## Available Tools (META_TOOLS)

All tools are async and search Apps → Classes → Methods hierarchy.

**Search Tools** (all use uniform \`GetEntityDto\`):
- \`get_apps(dto)\`, \`get_classes(dto)\`, \`get_methods(dto)\`, \`get_method_details(dto)\`
- DTO: \`{ categories?, apps?, classes?, methods?, search_queries: string[], top: number, threshold?: number }\`
- Filtering: \`threshold\` (0.0-1.0, higher=stricter). Simple: 0.4-0.5, top 1-3. Complex: 0.2-0.3, top 5-10. Use \`categories\` for category filtering. AI decides which filters are relevant per method.

**Q&A Tools** (USE for verification): \`ask_to_apps(app_slugs[], question)\`, \`ask_to_classes(class_slugs[], question)\`, \`ask_to_methods(method_slugs[], question)\` → \`{ yes, no, answer }\`. Always verify candidates match query aspects.

**Completion**: \`finish(method_slugs[])\` - **MUST call in every code section.** Empty array allowed for conversational queries.

## Strategy

**CRITICAL: Multi-Concept Queries** - If query has multiple distinct concepts/keywords (e.g., "TVL" AND "open interest"), you MUST search for each concept SEPARATELY and merge results. DO NOT mix unrelated search terms in one query.

**Simple queries**: Quick targeted search (threshold 0.4-0.5, top 1-3), verify with ask_to_methods if needed, call \`finish()\` in step 1. **Aim to finish in step 1-2.**

**Complex/Multi-Concept queries**: 
1. Identify distinct concepts (e.g., "TVL protocols" + "open interest exchanges")
2. Search for EACH concept separately (different get_methods calls)
3. Merge results: \`var allMethods = [...methods1, ...methods2]\`
4. Verify with ask_to_methods: "Does this handle [concept]?"
5. Branch based on yes/no answers - fetch more if gaps found

**Verification Pattern**:
\`\`\`javascript
var result = await ask_to_methods(methodSlugs, "Does this handle open interest data?");
if (result.no) {
  // Branch: Search for open interest specifically
  var moreApps = await get_apps({ search_queries: ["open interest"], top: 3 });
  var moreMethods = await get_methods({ apps: moreApps.map(a => a.slug), search_queries: ["open interest"], top: 2 });
  allMethods = [...allMethods, ...moreMethods];
}
\`\`\`

**Goals**: Cover ALL query aspects (verify with ask_), avoid duplicates, ensure comprehensive coverage. Greetings/thanks → \`finish([])\` immediately.

**Logging**: Log counts, slugs, insights only. Don't log entire objects/arrays.

## Response Format

Return JSON: \`{ lines: string[], thought: { reasoning?: string } }\`. Code MUST end with \`await finish([...method_slugs])\`.

Examples:
\`\`\`
// Simple single concept - use var for all variables
var methods = await get_methods({ search_queries: ["bitcoin price"], top: 3, threshold: 0.4 });
await finish([methods[0].slug]);

// Multi-concept query (TVL + open interest) - search separately
var tvlMethods = await get_methods({ search_queries: ["TVL", "total value locked"], top: 3, threshold: 0.4 });
var oiMethods = await get_methods({ search_queries: ["open interest"], top: 3, threshold: 0.4 });
var allMethods = [...tvlMethods, ...oiMethods];
await finish(allMethods.map(m => m.slug));

// With verification and branching
var methods = await get_methods({ search_queries: ["price data"], top: 5, threshold: 0.4 });
var result = await ask_to_methods(methods.map(m => m.slug), "Does this provide real-time price data?");
if (result.no) {
  var moreApps = await get_apps({ search_queries: ["real-time", "live price"], top: 3 });
  var moreMethods = await get_methods({ apps: moreApps.map(a => a.slug), search_queries: ["real-time"], top: 2 });
  methods = [...methods, ...moreMethods];
}
await finish(methods.map(m => m.slug));
\`\`\``;

  const firstUserPrompt = `User query: "${query}"

**Step 1: Identify distinct concepts** - Does this query have multiple unrelated concepts? (e.g., "TVL" + "open interest" are 2 concepts)

**Step 2: Search strategy**:
- Single concept: Quick search (threshold 0.4-0.5, top 1-3), verify with ask_to_methods, finish in step 1
- Multiple concepts: Search EACH concept separately, merge results, verify coverage with ask_to_methods

**Step 3: Verification & Branching**:
- Use ask_to_methods to verify: "Does this handle [specific concept from query]?"
- If result.no or missing coverage: Branch and search specifically for that concept
- Ensure ALL keywords/concepts from query are covered

**Priority**: Finish in step 1-2 when possible. Only use step 3 for truly complex queries.

Return JSON with \`lines\` (code ending with finish()) and \`thought.reasoning\`.`;

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
        
        // Remove code lines (lines starting with '>') - we already show code separately
        const lines = formatted.split('\n');
        const resultLines = lines.filter(line => {
          const trimmed = line.trim();
          // Skip lines that are just the code (starting with '>')
          // Keep only actual output/results (not empty, not code lines)
          return trimmed.length > 0 && !trimmed.startsWith('>');
        });
        formatted = resultLines.join('\n').trim();
        
        // If empty after filtering, use a summary instead
        if (!formatted || formatted === 'undefined') {
          formatted = '(No output)';
        }
        
        // No truncation - let the LLM control output through smart logging guidelines
        return formatted;
      })
      .filter(output => output && output !== '(No output)') // Remove empty outputs
      .join("\n\n");

    // No truncation limit - trust the LLM to be selective based on guidelines
    const finalReplOutputs = replOutputs;

    messages.push({
      role: "assistant",
      content: `Lines executed:
${item.lines.lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

Thought: ${JSON.stringify(item.thought)}

REPL Output:
${finalReplOutputs}`,
    });
    messages.push({
      role: "user",
      content: "Review the previous result. Check if ALL concepts/keywords from the query are covered. Use ask_to_methods to verify coverage. If any concept is missing, branch and search for it specifically. If comprehensive coverage is achieved, call finish() now.",
    });
  }

  // On the last step, add a special instruction to make final decision
  if (currentStep === maxSteps) {
    messages.push({
      role: "user",
      content: "⚠️ CRITICAL: This is your FINAL step (step 3 of 3). You MUST call finish() with your final method slugs array now. Review all the information you've gathered, ensure comprehensive coverage of the query, and call finish(method_slugs) with your complete tool selection.",
    });
  }

  // Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
  // Note: GPT-5 models may use reasoning tokens, so actual usage may be higher
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);
  
  console.log(`[tool-selector] Calling OpenAI for iteration ${executionHistory.length + 1}...`);
  console.log(`[tool-selector] Context size: ~${estimatedTokens} tokens (${totalChars} chars, ${messages.length} messages)`);
  
  // No hard limits - just informational logging
  // Trust the LLM to manage context through smart logging guidelines
  
  try {
    const response = await openai.chat.completions.create(
      {
        model: "gpt-5-nano-2025-08-07",
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
  
    return parseOpenAIResponse(response);
  } catch (error) {
    console.error(`[tool-selector] OpenAI call failed:`, error instanceof Error ? error.message : String(error));
    // Return empty lines - the loop will continue or hit max steps
    return {
      lines: { lines: [] },
      thought: { 
        reasoning: `OpenAI call failed: ${error instanceof Error ? error.message : "Unknown error"}` 
      }
    };
  }
}

/**
 * Parse OpenAI response into lines and thought
 */
function parseOpenAIResponse(response: ChatCompletion): { lines: LinesDto; thought: ThoughtDto } {
  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error("[tool-selector] No content in OpenAI response");
    return {
      lines: { lines: [] },
      thought: { reasoning: "No response from OpenAI" }
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
    return { lines, thought };
  } catch (error) {
    console.error("[tool-selector] Failed to parse OpenAI response:", error);
    console.error("[tool-selector] Response content:", content.substring(0, 500));
    return {
      lines: { lines: [] },
      thought: { reasoning: "Failed to parse OpenAI response" }
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
    const errors = outputs.filter(o => o.error);
    if (errors.length > 0) {
      console.error(`[tool-selector] ${errors.length} error(s) in execution:`);
      errors.forEach((output, idx) => {
        console.error(`[tool-selector] Error ${idx + 1}:`, output.error);
        if (output.formattedOutput) {
          console.error(`[tool-selector] Error ${idx + 1} output:`, output.formattedOutput);
        }
      });
    }

    return {
      success: true,
      outputs,
    };
  } catch (error) {
    console.error("[tool-selector] Execution failed:", error instanceof Error ? error.message : String(error));
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
  console.log(`[tool-selector] Starting tool selection for query: "${query.substring(0, 60)}${query.length > 60 ? "..." : ""}"`);

  // Step 1: Analyzing query
  if (onStepChange) {
    await onStepChange("Analyzing query...");
  }

  const { systemPrompt, firstUserPrompt } = await prepare_initial_context(query);

  const session = createReplSession();
  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Generating exploration code...`);

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

    // Step 3: Exploring tools (executing code)
    if (onStepChange && lines.lines.length > 0) {
      await onStepChange("Exploring tools...");
    }

    // Execute the lines in the persistent REPL session
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Executing ${lines.lines.length} line(s) of code...`);
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Code to execute:`);
    lines.lines.forEach((line, idx) => {
      console.log(`  ${idx + 1}: ${line}`);
    });
    const result = await executeLines(session, lines.lines);
    
    // Check if finish() was called
    const finishResult = session.getFinishResult();
    if (finishResult !== null) {
      const toolSlugs = finishResult;
      console.log(`[tool-selector] ✓ Tool selection complete: finish() called with ${toolSlugs.length} tool(s) in ${step} step(s)`);

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
      const methods = toolSlugs.length > 0
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
      const errorCount = result.outputs.filter(o => o.error).length;
      if (errorCount > 0) {
        console.error(`[tool-selector] Step ${step}/${maxSteps}: ⚠ ${errorCount} error(s) during execution`);
        // Log each error with details
        result.outputs.forEach((output, idx) => {
          if (output.error) {
            console.error(`[tool-selector] Step ${step}/${maxSteps} - Error ${idx + 1}:`, output.error);
          }
        });
      } else {
        console.log(`[tool-selector] Step ${step}/${maxSteps}: ✓ Execution complete`);
      }
    } else {
      console.error(`[tool-selector] Step ${step}/${maxSteps}: ✗ Execution failed`);
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

