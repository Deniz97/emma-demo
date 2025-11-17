import { openai } from "./openai-client";
import {
  get_apps,
  get_classes,
  get_methods,
  get_method_details,
  ask_to_method,
  ask_to_class,
  ask_to_app,
} from "./meta-tools";
import {
  CodeDto,
  ThoughtDto,
  ResultDto,
  ExecutionHistoryItem,
  MetaToolsContext,
  ToolSelectorResult,
} from "@/types/tool-selector";
import { ChatMessage } from "@/types/chat";
import { Method } from "@/types/tool";
import { prisma } from "./prisma";

// Create META_TOOLS context
const META_TOOLS: MetaToolsContext = {
  get_apps,
  get_classes,
  get_methods,
  get_method_details,
  ask_to_method,
  ask_to_class,
  ask_to_app,
};

/**
 * Prepares the initial context for the tool selection loop
 */
export function prepare_initial_context(
  query: string,
  metaTools: MetaToolsContext
): { systemPrompt: string; firstUserPrompt: string } {
  console.log("[tool-selector] Preparing initial context for tool selection");
  console.log(`[tool-selector] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);

  const systemPrompt = `You are a tool selection assistant. Your task is to help select relevant tools from a large pool of available tools.

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
2. You MUST assign results to variables or return them so they are visible in the next iteration
3. Use results from previous iterations (visible in execution history) to narrow down your search
4. Extract slugs from returned objects (e.g., apps.map(a => a.slug)) to use in subsequent calls

Example good code:
\`\`\`javascript
const apps = await get_apps(["cryptocurrency", "bitcoin"], 5);
const appSlugs = apps.map(a => a.slug);
const classes = await get_classes(appSlugs, ["price"], 3);
return { apps, classes }; // Return so values are visible
\`\`\`

The \`thought\` object should have:
- \`stop\`: boolean - set to true when you've found the relevant tools
- \`tools\`: string[] - array of method slugs (in format: app.class.method) when stop is true
- \`reasoning\`: string - explanation of your approach

When you're ready to stop, set thought.stop = true and thought.tools to the array of method slugs you've selected.

IMPORTANT: You must respond in valid JSON format with \`code\` and \`thought\` properties.`;

  const firstUserPrompt = `User query: "${query}"

Please start exploring the tool space to find relevant tools for this query. Write code that uses the META_TOOLS to search and filter tools. Return your response as a JSON object.`;

  console.log(`[tool-selector] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[tool-selector] User prompt length: ${firstUserPrompt.length} chars`);

  return { systemPrompt, firstUserPrompt };
}

/**
 * Generates the next code script and thought using OpenAI
 */
export async function generate_next_script(
  systemPrompt: string,
  firstUserPrompt: string,
  executionHistory: ExecutionHistoryItem[]
): Promise<{ code: CodeDto; thought: ThoughtDto }> {
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
    messages.push({
      role: "assistant",
      content: `Code executed:
\`\`\`javascript
${item.code.code}
\`\`\`

Thought: ${JSON.stringify(item.thought)}

Result: ${JSON.stringify(item.result)}`,
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
    const code: CodeDto = {
      code: parsed.code || "",
    };
    const thought: ThoughtDto = {
      stop: parsed.thought?.stop || false,
      tools: parsed.thought?.tools || undefined,
      reasoning: parsed.thought?.reasoning || undefined,
    };
    console.log(`[tool-selector] Parsed code (${code.code.length} chars)`);
    console.log(`[tool-selector] Thought - stop: ${thought.stop}, tools: ${thought.tools?.length || 0}, reasoning: "${thought.reasoning?.substring(0, 50)}${(thought.reasoning?.length || 0) > 50 ? "..." : ""}"`);
    return { code, thought };
  } catch (error) {
    console.error("[tool-selector] ERROR: Failed to parse JSON response:", error);
    // Fallback: try to extract code and thought from text response
    const codeMatch = content.match(/```(?:javascript|js)?\n([\s\S]*?)```/);
    const code: CodeDto = {
      code: codeMatch ? codeMatch[1] : content,
    };
    const thought: ThoughtDto = {
      stop: false,
      reasoning: "Failed to parse structured response",
    };
    console.log("[tool-selector] Using fallback parsing");
    return { code, thought };
  }
}

/**
 * Executes code using eval() with META_TOOLS injected into the execution environment
 */
export async function run_code(
  code: string,
  metaTools: MetaToolsContext
): Promise<ResultDto> {
  console.log("[tool-selector] Executing generated code...");
  console.log(`[tool-selector] Code length: ${code.length} chars`);

  try {
    // Create a context with META_TOOLS available
    const get_apps = metaTools.get_apps;
    const get_classes = metaTools.get_classes;
    const get_methods = metaTools.get_methods;
    const get_method_details = metaTools.get_method_details;
    const ask_to_method = metaTools.ask_to_method;
    const ask_to_class = metaTools.ask_to_class;
    const ask_to_app = metaTools.ask_to_app;

    // Wrap code in an async function to handle promises
    // META_TOOLS are available in the closure
    const wrappedCode = `
      (async () => {
        ${code}
      })
    `;

    const func = eval(wrappedCode);
    const result = await func();

    console.log("[tool-selector] Code execution successful");
    console.log(`[tool-selector] Result type: ${typeof result}, ${Array.isArray(result) ? `array length: ${result.length}` : ""}`);

    return {
      success: true,
      output: result,
    };
  } catch (error) {
    console.error("[tool-selector] ERROR: Code execution failed:", error);
    console.error(`[tool-selector] Error message: ${error instanceof Error ? error.message : String(error)}`);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
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

  const { systemPrompt, firstUserPrompt } = prepare_initial_context(
    query,
    META_TOOLS
  );

  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;
    console.log(`\n[tool-selector] --- Step ${step}/${maxSteps} ---`);

    // Generate next script and thought
    const { code, thought } = await generate_next_script(
      systemPrompt,
      firstUserPrompt,
      executionHistory
    );

    // Check if we should stop
    if (thought.stop && thought.tools) {
      console.log(`[tool-selector] Stop condition met! Found ${thought.tools.length} tool(s)`);
      console.log(`[tool-selector] Tool slugs: ${thought.tools.join(", ")}`);
      console.log("[tool-selector] Fetching Method objects from database...");

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
      };
    }

    // Execute the code
    const result = await run_code(code.code, META_TOOLS);

    // Append to execution history
    executionHistory.push({
      code,
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
  };
}

