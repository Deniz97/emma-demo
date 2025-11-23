import { openai } from "./openai-client";
import { selectTools } from "./tool-selector";
import { summarizeQueryWithHistory } from "./query-summarizer";
import { ChatMessage, MessageMetadata } from "@/types/chat";
import { Method } from "@/types/tool";
import { executeToolWithLLMWrapper } from "./tool-wrapper";
import { getModel } from "./model-config";
import { buildSystemPromptWithToolDetails } from "./chat/system-prompt-builder";
import { convertMethodsToOpenAITools } from "./chat/tool-converter";
import type {
  ChatCompletionMessageToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

// Maximum number of tool call iterations allowed in the main LLM loop
// Currently we do 1 iteration: call with tools -> execute -> call with results
// This constant is for future expansion to support multi-turn tool use
const MAX_TOOL_ITERATIONS = 6;

/**
 * Generates AI response using tool selection and OpenAI
 * @param chatHistory - The conversation history
 * @param onStepChange - Optional callback to update processing step
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
  console.log(
    `[chat-service] Selected tool names: ${selectedMethods.map((m) => m.name).join(", ")}`
  );

  // Step 2: Calling emma (preparing tools and calling LLM)
  if (onStepChange) {
    await onStepChange("Calling emma...");
  }
  const tools = convertMethodsToOpenAITools(selectedMethods);
  console.log(
    `[chat-service] Converted ${tools.length} tool(s) to OpenAI format`
  );
  console.log(
    `[chat-service] Tool names in OpenAI format: ${tools.map((t) => t.function.name).join(", ")}`
  );

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
  console.log(
    `[chat-service] Tools being sent: ${JSON.stringify(
      tools.map((t) => ({
        name: t.function.name,
        description: t.function.description.substring(0, 100) + "...",
      })),
      null,
      2
    )}`
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
  if (
    tools.length > 0 &&
    (!assistantMessage?.tool_calls || assistantMessage.tool_calls.length === 0)
  ) {
    console.warn(
      `[chat-service] ⚠️  WARNING: ${tools.length} tool(s) were available but LLM did not call any tools`
    );
    console.warn(
      `[chat-service] Response content preview: ${assistantMessage?.content?.substring(0, 200)}...`
    );
    if (
      assistantMessage?.content?.toLowerCase().includes("don't have access") ||
      assistantMessage?.content
        ?.toLowerCase()
        .includes("don't have direct access") ||
      assistantMessage?.content?.toLowerCase().includes("no access")
    ) {
      console.error(
        `[chat-service] ❌ ERROR: LLM incorrectly claimed it doesn't have access to tools when ${tools.length} tool(s) were provided!`
      );
    }
  }

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

              // First, try to get explicit query field
              query = args.query || "";

              // If no query field, generate one from the arguments
              if (!query && typeof args === "object" && args !== null) {
                const argEntries = Object.entries(args)
                  .filter(([key]) => key !== "query")
                  .map(([key, value]) => `${key}: ${value}`);
                if (argEntries.length > 0) {
                  query = argEntries.join(", ");
                }
              }
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
          const toolExecutionResult = await executeToolWithLLMWrapper(
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
            processedResult: toolExecutionResult.result,
            executionTimeMs,
            iteration: iterationCount,
            rawToolCall: call,
            tavilyData: toolExecutionResult.tavilyData,
          };
          toolExecutionData.push(toolData);

          // Log what we're storing for debugging
          console.log(`[chat-service]   Storing tool data:`, {
            toolName,
            queryLength: query.length,
            processedResultLength: toolExecutionResult.result.length,
            iteration: iterationCount,
          });

          return {
            tool_call_id:
              "id" in call ? call.id : `call_${iterationCount}_${index}`,
            role: "tool" as const,
            name: toolName,
            content: toolExecutionResult.result,
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
    console.log(
      `[chat-service] Metadata mainLLM.toolCalls:`,
      metadata.mainLLM.toolCalls.map((tc) => ({
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
