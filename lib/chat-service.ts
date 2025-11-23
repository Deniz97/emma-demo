import { openai } from "./openai-client";
import { selectTools } from "./tool-selector";
import { summarizeQueryWithHistory } from "./query-summarizer";
import { ChatMessage, MessageMetadata } from "@/types/chat";
import { Method } from "@/types/tool";
import { executeToolWithLLMWrapper } from "./tool-wrapper";
import { getModel } from "./model-config";
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// Maximum number of tool call iterations allowed in the main LLM loop
// Currently we do 1 iteration: call with tools -> execute -> call with results
// This constant is for future expansion to support multi-turn tool use
const MAX_TOOL_ITERATIONS = 6;

/**
 * Converts Method objects to OpenAI function definitions format
 * Each tool accepts a single 'query' parameter (string) and returns a processed string result
 * The description includes information about supported inputs (arguments) and expected outputs (return type)
 */
export function convertMethodsToOpenAITools(methods: Method[]): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return methods.map((method) => {
    // Build input information from method arguments
    const inputInfo =
      method.arguments && method.arguments.length > 0
        ? `\n\nSupported Inputs: This tool accepts queries that reference the following parameters:\n${method.arguments
            .map(
              (arg) =>
                `  - ${arg.name} (${arg.type}): ${
                  arg.description || "No description"
                }`
            )
            .join("\n")}`
        : "";

    // Build output information from return type
    const outputInfo = method.returnType
      ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following type and format: ${
          method.returnType
        }${method.returnDescription ? ` - ${method.returnDescription}` : ""}`
      : method.returnDescription
      ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following format: ${method.returnDescription}`
      : "";

    // Build comprehensive description with input/output information
    const description = `${
      method.description || `Execute ${method.name} tool`
    }${inputInfo}${outputInfo}\n\nIMPORTANT: Your query should only reference concepts that match the supported inputs listed above, and you should only expect data that matches the expected output type.`;

    return {
      type: "function" as const,
      function: {
        name: method.name,
        description,
        parameters: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description:
                "Natural language query describing what you want to know or do with this tool. Only include concepts that match the tool's supported inputs (see description above).",
            },
          },
          required: ["query"],
        },
      },
    };
  });
}

/**
 * Builds a creative, proactive system prompt focused on active tool usage
 */
function buildSystemPromptWithToolDetails(methods: Method[]): string {
  if (methods.length === 0) {
    return `You are a creative AI assistant specializing in cryptocurrency. Engage naturally and share insights.`;
  }

  // Build concise tool listing
  const toolDetails = methods
    .map((method) => {
      const argsInfo =
        method.arguments && method.arguments.length > 0
          ? ` | Args: ${method.arguments
              .map((arg) => `${arg.name} (${arg.type})`)
              .join(", ")}`
          : "";

      const returnInfo = method.returnType
        ? ` | Returns: ${method.returnType}`
        : "";

      return `• ${method.name}: ${
        method.description || "No description"
      }${argsInfo}${returnInfo}`;
    })
    .join("\n");

  return `You are a proactive cryptocurrency assistant with ${methods.length} data tools. Provide insightful, engaging responses.

TOOLS:
${toolDetails}

APPROACH:
• Make intelligent assumptions - infer parameters (USD, 24h, top assets) rather than asking
• Use multiple tools creatively to provide comprehensive context
• Present data with insights, not just raw numbers

AVOID:
• Asking for obvious parameters
• Using memory when current data is available via tools

Use tools proactively to deliver thoughtful, comprehensive responses.`;
}

/**
 * Generates AI response using tool selection and OpenAI
 */
export async function generateResponse(
  chatHistory: ChatMessage[],
  onStepChange?: (step: string) => Promise<void>
): Promise<{ content: string; metadata: MessageMetadata }> {
  console.log(`\n[chat-service] ====================================`);
  console.log(`[chat-service] === Chat Service: Generate Response ===`);
  console.log(`[chat-service] ====================================`);
  console.log(`[chat-service] Chat history: ${chatHistory.length} messages`);

  // Step 1: Preparing response
  if (onStepChange) {
    await onStepChange("Preparing response...");
  }

  // Get the latest user message
  const userMessages = chatHistory.filter((msg) => msg.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1];

  if (!latestUserMessage) {
    throw new Error("No user messages found in chat history");
  }

  // Summarize query with conversation context
  const summarizedQuery = await summarizeQueryWithHistory(chatHistory);

  // Call ToolSelector to get relevant tools
  let toolSelectorResult;
  try {
    toolSelectorResult = await selectTools(
      summarizedQuery,
      chatHistory,
      3,
      onStepChange
    );
  } catch (error) {
    console.error(
      "[chat-service] Tool selector failed:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }

  // Convert tools to OpenAI format
  // Tool selector always returns Method objects (never strings), so we can safely cast
  const selectedMethods = toolSelectorResult.tools as Method[];
  console.log(
    `[chat-service] Tool selector returned ${toolSelectorResult.tools.length} tool(s), using ${selectedMethods.length} method(s)`
  );

  // Step 2: Calling emma (preparing tools and calling LLM)
  if (onStepChange) {
    await onStepChange("Calling emma...");
  }
  const tools = convertMethodsToOpenAITools(selectedMethods);

  // Create a mapping of tool names to methods for later lookup
  const methodMap = new Map<string, Method>();
  selectedMethods.forEach((method) => {
    methodMap.set(method.name, method);
  });

  // Build comprehensive system prompt with tool details
  const systemPrompt = buildSystemPromptWithToolDetails(selectedMethods);

  // Prepare messages for OpenAI
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    {
      role: "system",
      content: systemPrompt,
    },
    ...chatHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  // Step 3: Thinking (during main LLM call)
  if (onStepChange) {
    await onStepChange("Thinking...");
  }

  // Call OpenAI with tools
  console.log(
    `[chat-service] Calling main LLM with ${tools.length} tool(s) available (max iterations: ${MAX_TOOL_ITERATIONS})`
  );
  const response = await openai.chat.completions.create({
    model: getModel("chat"),
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });

  const assistantMessage = response.choices[0]?.message;
  console.log(
    `[chat-service] Main LLM response received (tool calls: ${
      assistantMessage?.tool_calls?.length || 0
    })`
  );

  if (!assistantMessage) {
    throw new Error("No assistant message received from OpenAI");
  }

  // Handle tool calls with iterative support
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    let iterationCount = 0;
    const currentMessages: ChatCompletionMessageParam[] = [
      ...messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];
    let finalContent = "";
    let currentAssistantMessage: typeof assistantMessage = assistantMessage;
    const toolExecutionData: Array<{
      toolName: string;
      query: string;
      processedResult: string;
      executionTimeMs?: number;
      iteration: number;
      rawToolCall?: ChatCompletionMessageToolCall;
    }> = [];
    const allToolCalls: ChatCompletionMessageToolCall[] = []; // Track all raw tool calls across iterations

    // Iterative tool execution loop
    while (iterationCount < MAX_TOOL_ITERATIONS) {
      iterationCount++;

      // Step 4: Executing tools
      if (onStepChange) {
        await onStepChange("Executing tools...");
      }

      console.log(
        `[chat-service] === Tool Execution Phase (Iteration ${iterationCount}/${MAX_TOOL_ITERATIONS}) ===`
      );
      console.log(
        `[chat-service] Executing ${
          currentAssistantMessage.tool_calls!.length
        } tool call(s)...`
      );

      // Store raw tool calls for this iteration
      if (currentAssistantMessage.tool_calls) {
        allToolCalls.push(...currentAssistantMessage.tool_calls);
      }

      // Execute all tool calls in parallel
      const toolCallPromises = currentAssistantMessage.tool_calls!.map(
        async (call, index) => {
          const startTime = Date.now();
          const toolName =
            "function" in call &&
            call.function &&
            typeof call.function === "object" &&
            "name" in call.function
              ? call.function.name
              : "unknown";

          // Extract query parameter from function arguments
          let query = "";
          if (
            "function" in call &&
            call.function &&
            typeof call.function === "object" &&
            "arguments" in call.function
          ) {
            try {
              const args =
                typeof call.function.arguments === "string"
                  ? JSON.parse(call.function.arguments)
                  : call.function.arguments;
              query = args.query || "";
            } catch (error) {
              console.error(
                `[chat-service] ERROR parsing tool arguments:`,
                error
              );
              query = "";
            }
          }

          console.log(`[chat-service]   Tool ${index + 1}: ${toolName}`);
          console.log(
            `[chat-service]   Query: "${query.substring(0, 60)}${
              query.length > 60 ? "..." : ""
            }"`
          );

          // Find the corresponding method
          const method = methodMap.get(toolName);
          if (!method) {
            throw new Error(`Tool ${toolName} not found in method map`);
          }

          // Execute tool with LLM wrapper
          const processedResult = await executeToolWithLLMWrapper(
            method,
            query
          );
          const executionTimeMs = Date.now() - startTime;

          console.log(
            `[chat-service]   Tool ${
              index + 1
            }: ✓ Complete (${executionTimeMs}ms)`
          );

          // Store tool execution data for metadata
          const toolData = {
            toolName,
            query,
            processedResult,
            executionTimeMs,
            iteration: iterationCount,
            rawToolCall: call,
          };
          toolExecutionData.push(toolData);

          // Log what we're storing for debugging
          console.log(`[chat-service]   Storing tool data:`, {
            toolName,
            queryLength: query.length,
            processedResultLength: processedResult.length,
            iteration: iterationCount,
          });

          return {
            tool_call_id:
              "id" in call ? call.id : `call_${iterationCount}_${index}`,
            role: "tool" as const,
            name: toolName,
            content: processedResult,
          };
        }
      );

      const toolResults = await Promise.all(toolCallPromises);
      const iterationToolTime = toolExecutionData
        .filter((t) => t.iteration === iterationCount)
        .reduce((sum, t) => sum + (t.executionTimeMs || 0), 0);
      console.log(
        `[chat-service] Iteration ${iterationCount} tools executed in ${iterationToolTime}ms`
      );

      // Add assistant message with tool calls and tool results to conversation
      currentMessages.push({
        role: "assistant" as const,
        content: currentAssistantMessage.content || "",
        tool_calls: currentAssistantMessage.tool_calls,
      });
      currentMessages.push(...toolResults);

      // Check if we've reached max iterations
      if (iterationCount >= MAX_TOOL_ITERATIONS) {
        console.log(
          `[chat-service] Max iterations reached (${MAX_TOOL_ITERATIONS}), generating final response...`
        );
        // Step 7: Finalizing response (max iterations reached)
        if (onStepChange) {
          await onStepChange("Finalizing response...");
        }
        const finalResponse = await openai.chat.completions.create({
          model: getModel("chat"),
          messages: currentMessages as ChatCompletionMessageParam[],
        });
        const finalMessage = finalResponse.choices[0]?.message;
        finalContent =
          finalMessage?.content ||
          "I executed the tools, but reached the maximum number of iterations.";
        break;
      }

      // Step 5: Processing results (after tools execute)
      if (onStepChange) {
        await onStepChange("Processing results...");
      }

      // Step 6: Thinking (before next LLM call)
      if (onStepChange) {
        await onStepChange("Thinking...");
      }

      // Call LLM again to see if it wants to make more tool calls or provide final response
      console.log(
        `[chat-service] Calling main LLM again (iteration ${
          iterationCount + 1
        }) to check for more tool calls or final response...`
      );
      const nextResponse = await openai.chat.completions.create({
        model: getModel("chat"),
        messages: currentMessages as ChatCompletionMessageParam[],
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      currentAssistantMessage = nextResponse.choices[0]?.message;
      if (!currentAssistantMessage) {
        throw new Error("No assistant message received from OpenAI");
      }

      // If no tool calls, we have the final response
      if (
        !currentAssistantMessage.tool_calls ||
        currentAssistantMessage.tool_calls.length === 0
      ) {
        // Step 7: Finalizing response (normal completion)
        if (onStepChange) {
          await onStepChange("Finalizing response...");
        }
        finalContent =
          currentAssistantMessage.content ||
          "I executed the tools, but couldn't generate a final response.";
        console.log(
          `[chat-service] ✓ Final response generated after ${iterationCount} iteration(s) (${finalContent.length} chars)`
        );
        break;
      }
    }

    // Build metadata from debug data
    const metadata: MessageMetadata = {};
    if (toolSelectorResult.debugData) {
      metadata.toolSelector = {
        ...toolSelectorResult.debugData,
        selectedTools: selectedMethods.map((m) => ({
          slug: m.id,
          name: m.name,
          description: m.description,
        })),
      };
    }
    const totalToolTime = toolExecutionData.reduce(
      (sum, t) => sum + (t.executionTimeMs || 0),
      0
    );
    metadata.mainLLM = {
      systemPrompt: systemPrompt,
      userPrompt: latestUserMessage.content,
      maxIterations: MAX_TOOL_ITERATIONS,
      actualIterations: iterationCount,
      toolCallsRequested: allToolCalls.length,
      toolCallsExecuted: toolExecutionData.length,
      totalExecutionTimeMs: totalToolTime,
      toolCalls: toolExecutionData,
    };

    // Log metadata structure before saving (verify query and processedResult are present)
    console.log(`[chat-service] Metadata mainLLM.toolCalls:`, 
      metadata.mainLLM.toolCalls.map(tc => ({
        toolName: tc.toolName,
        queryLength: tc.query?.length || 0,
        processedResultLength: tc.processedResult?.length || 0,
        hasRawToolCall: !!tc.rawToolCall,
      }))
    );

    console.log(`[chat-service] ====================================`);
    console.log(`[chat-service] Response generation complete (WITH TOOLS)`);
    console.log(
      `[chat-service]   - Tool selector steps: ${
        metadata.toolSelector?.executionHistory?.length || 0
      }`
    );
    console.log(
      `[chat-service]   - Tools selected: ${
        metadata.toolSelector?.selectedTools?.length || 0
      }`
    );
    console.log(
      `[chat-service]   - LLM iterations: ${metadata.mainLLM.actualIterations}/${metadata.mainLLM.maxIterations}`
    );
    console.log(
      `[chat-service]   - Tool calls executed: ${metadata.mainLLM.toolCallsExecuted}`
    );
    console.log(
      `[chat-service]   - Total execution time: ${metadata.mainLLM.totalExecutionTimeMs}ms`
    );
    console.log(`[chat-service] ====================================`);

    return {
      content: finalContent,
      metadata,
    };
  }

  // Step 4: Finalizing response (for direct responses without tools)
  if (onStepChange) {
    await onStepChange("Finalizing response...");
  }

  const responseContent =
    assistantMessage.content ||
    "I apologize, but I couldn't generate a response.";
  console.log(
    `[chat-service] ✓ Direct response (no tools used, ${responseContent.length} chars)`
  );

  // Build metadata from debug data
  const metadata: MessageMetadata = {};
  if (toolSelectorResult.debugData) {
    metadata.toolSelector = {
      ...toolSelectorResult.debugData,
      selectedTools: selectedMethods.map((m) => ({
        slug: m.id,
        name: m.name,
        description: m.description,
      })),
    };
  }
  metadata.mainLLM = {
    systemPrompt: systemPrompt,
    userPrompt: latestUserMessage.content,
    maxIterations: MAX_TOOL_ITERATIONS,
    actualIterations: 0, // No tool execution needed
    toolCallsRequested: 0,
    toolCallsExecuted: 0,
    totalExecutionTimeMs: 0,
    toolCalls: [],
  };

  console.log(`[chat-service] ====================================`);
  console.log(`[chat-service] Response generation complete (NO TOOLS)`);
  console.log(
    `[chat-service]   - Tool selector steps: ${
      metadata.toolSelector?.executionHistory?.length || 0
    }`
  );
  console.log(
    `[chat-service]   - Tools selected: ${
      metadata.toolSelector?.selectedTools?.length || 0
    }`
  );
  console.log(
    `[chat-service]   - LLM iterations: ${metadata.mainLLM.actualIterations}/${metadata.mainLLM.maxIterations}`
  );
  console.log(`[chat-service] ====================================`);

  return {
    content: responseContent,
    metadata,
  };
}
