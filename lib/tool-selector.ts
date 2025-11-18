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
export function prepare_initial_context(
  query: string
): { systemPrompt: string; firstUserPrompt: string } {
  const systemPrompt = `You are a tool selection assistant operating in a persistent Node.js REPL environment. Your goal is to intelligently explore a large pool of tools (100-200) and select 0-10 relevant ones that comprehensively address the user's query.

## Environment

You have access to a **persistent Node.js REPL** where:
- Variables persist across all iterations - define once, reuse freely
- Full JavaScript/Node.js capabilities: arrays, objects, strings, regex, conditionals, etc.
- Standard methods: map, filter, reduce, find, sort, slice, spread, destructuring
- All tools return JavaScript objects that you can manipulate freely

## Available Tools (META_TOOLS)

All tools are async functions that must be awaited. They search a hierarchical database: Apps → Classes → Methods.

**Search Tools** (Vector similarity search):
- \`get_apps(search_queries: string[], top: number, threshold?: number)\` - Find apps by semantic search. Default threshold: 0.3 (0.0-1.0, higher = stricter). You control both \`top\` (how many results) and \`threshold\` (similarity cutoff).
- \`get_classes(app_slugs: string[], search_queries: string[], top: number, threshold?: number)\` - Find classes within apps. You control both \`top\` and \`threshold\`.
- \`get_methods(app_slugs: string[], class_slugs: string[], search_queries: string[], top: number, threshold?: number)\` - Find methods. You control both \`top\` and \`threshold\`.
- \`get_method_details(...)\` - Get detailed method information

**Filtering Strategy**: You decide how to filter results:
- **threshold** (0.0-1.0): Controls similarity cutoff. Lower (0.1-0.2) = more results but less relevant. Higher (0.4-0.6) = fewer but more precise. Default 0.3 is a good starting point.
- **top**: Maximum number of results to return. For simple queries, use smaller values (1-3). For complex queries, use larger values (5-10).
- **Filter in code**: After getting results, you can filter further using JavaScript (e.g., \`methods.filter(m => m.name.includes("price"))\`).

All entities have a \`.slug\` field - use these for subsequent queries (e.g., \`apps.map(a => a.slug)\`).

**Q&A Tools** (LLM-powered, can batch multiple slugs):
- \`ask_to_apps(app_slugs: string[], question: string)\` - Ask about apps
- \`ask_to_classes(class_slugs: string[], question: string)\` - Ask about classes  
- \`ask_to_methods(method_slugs: string[], question: string)\` - Ask about methods

Return: \`{ yes: boolean, no: boolean, answer: string }\`

**Completion Tool**:
- \`finish(method_slugs: string[])\` - Call this when you have your final tool selection. Pass an array of method slugs in format "app.class.method". This will terminate the selection process and return those tools. You can call \`finish()\` at any step when ready. Empty array is allowed for conversational queries.

## Your Goals

1. **Comprehensive Coverage**: If the query has multiple aspects (A, B, C, D), return tools for ALL of them
2. **Deduplication**: Prefer diverse functionality - avoid returning similar methods (e.g., two "getCurrentPrice")
3. **Early Termination for Simple Queries**: If the query is straightforward and obvious (e.g., "bitcoin price", "ETH volume"), do a quick targeted search with appropriate threshold and top values, verify with ask_to_* if needed, and call \`finish()\` immediately in step 1. Don't over-explore simple queries - be efficient. **Aim to finish in step 1 or step 2 whenever possible.**
4. **Comprehensive Exploration for Complex Queries**: Only use multiple steps for complex queries that need thorough exploration. For complex queries, generate comprehensive scripts with multiple search paths, edge case handling, and fallback strategies.
5. **Conversational Handling**: If query is just "hello" or "thanks", call \`finish([])\` immediately with an empty array
6. **Smart Logging**: You control what gets logged - be selective and strategic. Log counts, slugs, key insights, and summaries rather than entire large objects. Everything you log goes into execution history and affects context size, so be thoughtful about what's truly needed.

## Code Generation Strategy

**For Simple Queries**: If the query is straightforward (e.g., "bitcoin price", "ETH volume", "current price of X"), do a quick targeted search with appropriate parameters:
- Use higher threshold (0.4-0.5) for precision
- Use smaller top (1-3) since you only need a few results
- Filter results in code if needed
- Verify with ask_to_* if unsure
- Call \`finish()\` immediately in step 1. Don't over-engineer simple queries.

**For Complex Queries**: Write larger, more comprehensive code sections that include multiple exploration strategies. Don't write one line at a time - write substantial code blocks that try multiple approaches.

**Strategy Progression**: When exploring, always start with the most targeted approach and progressively broaden if needed:

1. **Start with Targeted Semantic Queries**: Use specific, precise search terms that directly match the user's query. Search for exact concepts, domain-specific terms, and relevant keywords.

2. **If Targeted Queries Return Few Results**: Try regex-based filtering on broader search results. Search with more general terms, then use regex patterns to filter the results to find what you need. This helps when exact semantic matches aren't available but similar functionality exists.

3. **If Still No Results**: Broaden your search with more general terms, synonyms, or related concepts. Cast a wider net and then filter or analyze the results.

4. **Use Q&A Tools Strategically**: When you have candidate tools but aren't sure if they match, use the ask_to_* tools to verify relevance before including them in your final selection.

**In Each Code Section**: Include multiple lines that try different strategies. Don't just do one search - do several searches with different approaches, filter results, ask questions, and analyze what you find. Think of each code section as a comprehensive exploration phase, not a single query.

**Example Flow in One Code Section**:
- First, try targeted semantic searches with specific terms
- If results are sparse, search more broadly and use regex to filter
- If still needed, try even more general searches
- Use Q&A tools to verify candidate tools
- Analyze and summarize findings
- Log key insights (counts, slugs, important findings)

Remember: You're not limited to one operation per code section. Write substantial code that explores multiple angles and strategies before deciding what to do next.

## Success Criteria

Before stopping, your selected tools should:
- Cover every distinct aspect of the user's query
- Provide diverse functionality (not duplicates)
- Be the most relevant available (use ask_to_* to verify if unsure)

If you get 0 search results, don't proceed with empty arrays - try synonyms, broaden search, or ask what's available.

## Smart Logging Guidelines

You have full control over what gets logged. Be strategic:
- **DO log**: Counts, slugs, key insights, yes/no answers, summaries, important findings
- **DON'T log**: Entire large objects/arrays, redundant information, verbose dumps
- **Principle**: Log what's needed for the next iteration, not everything you see. Log concise summaries like counts and identifiers rather than full data structures.

Remember: Everything you log becomes part of execution history and affects context size. Be thoughtful and selective.

## Response Format

Return JSON with:
- \`lines\`: Array of JavaScript code to execute. 
  - **CRITICAL**: Your code MUST end with a call to \`finish(method_slugs)\`. This is not optional - you must call finish() in your code.
  - **For simple queries**: Write code that does a quick targeted search, then immediately calls \`await finish(["app.class.method"])\` with the tool slug.
  - **For complex queries**: Write comprehensive exploration code, then call \`await finish([...method_slugs])\` when ready.
- \`thought.reasoning\`: String explaining your decision, what strategies you used, and why you selected the tools you did.

**MANDATORY**: Every code section you generate MUST include a call to \`finish()\` at the end. The format is: \`await finish(["app.class.method", "app2.class2.method2"])\`

**For simple queries** (like "bitcoin price", "ETH volume"): 
- Search with appropriate parameters: \`const methods = await get_methods([], [], ["bitcoin price"], 3, 0.4)\` (top=3, threshold=0.4 for precision)
- Filter if needed: \`const relevant = methods.filter(m => m.name.toLowerCase().includes("price"))\`
- Verify if needed: \`const check = await ask_to_methods(relevant.map(m => m.slug), "Does this return current price?")\`
- Call finish immediately: \`await finish([relevant[0].slug])\`

**For complex queries**:
- Explore thoroughly with multiple strategies
- When you have the tools, call \`await finish([...method_slugs])\`

Remember: finish() MUST be called in your code - it's how you return tools. Without calling finish(), no tools will be selected.`;

  const firstUserPrompt = `User query: "${query}"

Analyze the query. If it's a simple, straightforward query (like "bitcoin price", "ETH volume", "current price of X"), do a quick targeted search with appropriate threshold and top values, verify the tool is correct, and call finish() immediately in this first step. Only use multiple steps for complex queries that need thorough exploration.

**Priority**: Try to finish in step 1 or step 2 whenever possible. Only use step 3 for truly complex queries that require extensive exploration.

**Filtering Control**: You control both \`top\` (result count) and \`threshold\` (similarity cutoff) in your search calls. Choose values that match the query complexity:
- Simple queries: threshold 0.4-0.5, top 1-3
- Medium queries: threshold 0.3-0.4, top 3-5
- Complex queries: threshold 0.2-0.3, top 5-10

You can also filter results in code after getting them.

Return JSON with your code lines and reasoning.`;

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
      content: "Continue exploring based on the previous result. If you have enough information to make a final selection, call finish() now. Only continue exploring if you truly need more information.",
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
    
    // Only log errors
    const errors = outputs.filter(o => o.error);
    if (errors.length > 0) {
      console.error(`[tool-selector] ${errors.length} error(s) in execution`);
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
  maxSteps: number = 3
): Promise<ToolSelectorResult> {
  console.log(`[tool-selector] Starting tool selection for query: "${query.substring(0, 60)}${query.length > 60 ? "..." : ""}"`);

  const { systemPrompt, firstUserPrompt } = prepare_initial_context(query);

  const session = createReplSession();
  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Generating exploration code...`);

    // Generate next lines and thought
    const { lines, thought } = await generate_next_script(
      systemPrompt,
      firstUserPrompt,
      executionHistory,
      step,
      maxSteps
    );

    // Execute the lines in the persistent REPL session
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Executing ${lines.lines.length} line(s) of code...`);
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
        console.log(`[tool-selector] Step ${step}/${maxSteps}: ⚠ ${errorCount} error(s) during execution`);
      } else {
        console.log(`[tool-selector] Step ${step}/${maxSteps}: ✓ Execution complete`);
      }
    } else {
      console.log(`[tool-selector] Step ${step}/${maxSteps}: ✗ Execution failed`);
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

