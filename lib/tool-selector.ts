import { openai } from "./openai-client";
import { createReplSession } from "./repl/tools";
import { ReplSession } from "./repl/ReplSession";
import {
  LinesDto,
  ThoughtDto,
  ResultDto,
  ExecutionHistoryItem,
  ToolSelectorResult,
  ReplOutput,
} from "@/types/tool-selector";
import { ChatMessage } from "@/types/chat";
import { Method } from "@/types/tool";
import { prisma } from "./prisma";

/**
 * Prepares the initial context for the tool selection loop
 */
export function prepare_initial_context(
  query: string
): { systemPrompt: string; firstUserPrompt: string } {
  console.log("[tool-selector] Preparing initial context for tool selection");
  console.log(`[tool-selector] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);

  const systemPrompt = `You are a tool selection assistant. Your task is to help select relevant tools from a large pool of available tools.

You have access to a persistent Node.js REPL environment where variables and state are preserved between iterations. This means you can define variables in one iteration and use them in the next.

You have access to the following META_TOOLS (all are async functions):
- get_apps(search_queries: string[], top: number): Returns apps matching search queries
- get_classes(apps: string[], search_queries: string[], top: number): Returns classes within specified apps
- get_methods(apps: string[], classes: string[], search_queries: string[], top: number): Returns methods matching criteria
- get_method_details(apps: string[], classes: string[], method_ids: string[], search_queries: string[], top: number): Returns detailed method information
- ask_to_method(method_slug: string, query: string): Ask a question about a specific method
- ask_to_class(class_slug: string, query: string): Ask a question about a specific class
- ask_to_app(app_slug: string, query: string): Ask a question about a specific app

Your goal is to iteratively explore the tool space using these META_TOOLS to find the most relevant tools for the user's query.

IMPORTANT CODE REQUIREMENTS:
1. All META_TOOLS are async - you MUST use await when calling them
2. Variables you define will persist across iterations - you can reuse them in subsequent steps
3. Use console.log() to output intermediate results for debugging
4. Each line should be a valid JavaScript expression or statement
5. Extract slugs from returned objects (e.g., apps.map(a => a.slug)) to use in subsequent calls

Example interaction across iterations:
Iteration 1:
\`\`\`javascript
const apps = await get_apps(["cryptocurrency", "bitcoin"], 5)
console.log("Found apps:", apps.length)
\`\`\`

Iteration 2 (apps variable is still available):
\`\`\`javascript
const appSlugs = apps.map(a => a.slug)
const classes = await get_classes(appSlugs, ["price"], 3)
console.log("Found classes:", classes)
\`\`\`

The \`thought\` object should have:
- \`stop\`: boolean - set to true when you've found the relevant tools
- \`tools\`: string[] - array of method slugs (in format: app.class.method) when stop is true
- \`reasoning\`: string - explanation of your approach

When you're ready to stop, set thought.stop = true and thought.tools to the array of method slugs you've selected.

IMPORTANT: You must respond in valid JSON format with \`lines\` (array of code strings) and \`thought\` properties.

Response format:
{
  "lines": ["const apps = await get_apps(['crypto'], 5)", "console.log(apps)"],
  "thought": { "stop": false, "reasoning": "Searching for crypto apps..." }
}`;

  const firstUserPrompt = `User query: "${query}"

Please start exploring the tool space to find relevant tools for this query. Write code lines that use the META_TOOLS to search and filter tools. Return your response as a JSON object with "lines" and "thought" properties.`;

  console.log(`[tool-selector] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[tool-selector] User prompt length: ${firstUserPrompt.length} chars`);

  return { systemPrompt, firstUserPrompt };
}

/**
 * Generates the next code lines and thought using OpenAI
 */
export async function generate_next_script(
  systemPrompt: string,
  firstUserPrompt: string,
  executionHistory: ExecutionHistoryItem[]
): Promise<{ lines: LinesDto; thought: ThoughtDto }> {
  console.log("[tool-selector] Generating next script");
  console.log(`[tool-selector] Execution history length: ${executionHistory.length} iterations`);

  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: firstUserPrompt },
  ];

  // Add execution history as context
  for (const item of executionHistory) {
    // Format the REPL outputs
    const replOutputs = item.result.outputs
      .map((output) => output.formattedOutput)
      .join("\n\n");

    messages.push({
      role: "assistant",
      content: `Lines executed:
${item.lines.lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

Thought: ${JSON.stringify(item.thought)}

REPL Output:
${replOutputs}`,
    });
    messages.push({
      role: "user",
      content: "Continue exploring based on the previous result.",
    });
  }

  console.log(`[tool-selector] Calling OpenAI API (model: gpt-4-turbo-preview, messages: ${messages.length})...`);

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages,
    temperature: 0.7,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error("[tool-selector] ERROR: No response from OpenAI");
    throw new Error("No response from OpenAI");
  }

  console.log("[tool-selector] OpenAI response received, parsing...");

  try {
    const parsed = JSON.parse(content);
    const lines: LinesDto = {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
    const thought: ThoughtDto = {
      stop: parsed.thought?.stop || false,
      tools: parsed.thought?.tools || undefined,
      reasoning: parsed.thought?.reasoning || undefined,
    };
    console.log(`[tool-selector] Parsed ${lines.lines.length} line(s)`);
    console.log(`[tool-selector] Thought - stop: ${thought.stop}, tools: ${thought.tools?.length || 0}, reasoning: "${thought.reasoning?.substring(0, 50)}${(thought.reasoning?.length || 0) > 50 ? "..." : ""}"`);
    return { lines, thought };
  } catch (error) {
    console.error("[tool-selector] ERROR: Failed to parse JSON response:", error);
    // Fallback: return empty lines
    const lines: LinesDto = {
      lines: [],
    };
    const thought: ThoughtDto = {
      stop: false,
      reasoning: "Failed to parse structured response",
    };
    console.log("[tool-selector] Using fallback parsing");
    return { lines, thought };
  }
}

/**
 * Executes code lines in the REPL session
 */
async function executeLines(
  session: ReplSession,
  lines: string[]
): Promise<ResultDto> {
  console.log("[tool-selector] Executing generated lines in REPL...");
  console.log(`[tool-selector] Number of lines: ${lines.length}`);

  try {
    const outputs = await session.runLines(lines);
    
    console.log("[tool-selector] Lines execution completed");
    console.log(`[tool-selector] Outputs: ${outputs.length} result(s)`);
    
    // Check if any line had errors
    const hasErrors = outputs.some((output) => output.error);
    if (hasErrors) {
      console.log("[tool-selector] Some lines had errors, but execution continued");
    }

    return {
      success: true,
      outputs,
    };
  } catch (error) {
    console.error("[tool-selector] ERROR: Lines execution failed:", error);
    console.error(`[tool-selector] Error message: ${error instanceof Error ? error.message : String(error)}`);
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
  maxSteps: number = 10
): Promise<ToolSelectorResult> {
  console.log("\n[tool-selector] ========================================");
  console.log("[tool-selector] selectTools called");
  console.log(`[tool-selector] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);
  console.log(`[tool-selector] Max steps: ${maxSteps}`);

  const { systemPrompt, firstUserPrompt } = prepare_initial_context(query);

  // Create persistent REPL session
  const session = createReplSession();
  console.log("[tool-selector] Created persistent REPL session");

  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;
    console.log(`\n[tool-selector] --- Step ${step}/${maxSteps} ---`);

    // Generate next lines and thought
    const { lines, thought } = await generate_next_script(
      systemPrompt,
      firstUserPrompt,
      executionHistory
    );

    // Check if we should stop
    if (thought.stop && thought.tools) {
      console.log(`[tool-selector] Stop condition met! Found ${thought.tools.length} tool(s)`);
      console.log(`[tool-selector] Tool slugs: ${thought.tools.join(", ")}`);
      console.log("[tool-selector] Fetching Method objects from database...");

      // Add the final step to execution history (the one with stop=true)
      const finalStepHistory = [
        ...executionHistory,
        {
          lines,
          thought,
          result: {
            success: true,
            outputs: [],
          },
        },
      ];

      // Fetch Method objects by slugs
      const methods = await prisma.method.findMany({
        where: {
          slug: {
            in: thought.tools,
          },
        },
        include: {
          class: {
            include: {
              app: true,
            },
          },
        },
      });

      console.log(`[tool-selector] Retrieved ${methods.length} method(s) from database`);
      console.log(`[tool-selector] Methods: ${methods.map((m) => m.name).join(", ")}`);
      console.log("[tool-selector] ========================================\n");

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
          })),
        },
      };
    }

    // Execute the lines in the persistent REPL session
    const result = await executeLines(session, lines.lines);

    // Append to execution history
    executionHistory.push({
      lines,
      thought,
      result,
    });

    if (!result.success) {
      console.log(`[tool-selector] Step ${step} completed with execution error`);
    } else {
      console.log(`[tool-selector] Step ${step} completed successfully`);
    }
  }

  // If we've exhausted max steps, return empty result
  console.log(`[tool-selector] Max steps (${maxSteps}) reached without finding tools`);
  console.log("[tool-selector] Returning empty result");
  console.log("[tool-selector] ========================================\n");

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

