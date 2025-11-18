import { openai } from "./openai-client";
import { selectTools } from "./tool-selector";
import { ChatMessage, MessageMetadata } from "@/types/chat";
import { Method } from "@/types/tool";
import { executeToolWithLLMWrapper } from "./tool-wrapper";

// Maximum number of tool call iterations allowed in the main LLM loop
// Currently we do 1 iteration: call with tools -> execute -> call with results
// This constant is for future expansion to support multi-turn tool use
const MAX_TOOL_ITERATIONS = 6;

/**
 * Converts Method objects to OpenAI function definitions format
 * Each tool accepts a single 'query' parameter (string) and returns a processed string result
 */
export function convertMethodsToOpenAITools(
  methods: Method[]
): Array<{
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
  return methods.map((method) => ({
    type: "function" as const,
    function: {
      name: method.name,
      description: method.description || `Execute ${method.name} tool`,
      parameters: {
        type: "object" as const,
        properties: {
          query: {
            type: "string",
            description: "Natural language query describing what you want to know or do with this tool",
          },
        },
        required: ["query"],
      },
    },
  }));
}

/**
 * Builds a comprehensive system prompt that includes detailed information about available tools
 * This helps the LLM understand what each tool does and use them intelligently
 */
function buildSystemPromptWithToolDetails(methods: Method[]): string {
  if (methods.length === 0) {
    return `You are a helpful AI assistant that can use tools to help answer user questions.
You have access to various tools that can query cryptocurrency-related data.
Use the available tools when appropriate to provide accurate and helpful responses.`;
  }

  // Build detailed tool information
  const toolDetails = methods.map((method) => {
    const argsInfo = method.arguments && method.arguments.length > 0
      ? `\n  Arguments: ${method.arguments.map(arg => `${arg.name} (${arg.type}): ${arg.description}`).join(', ')}`
      : '';
    
    const returnInfo = method.returnDescription
      ? `\n  Returns: ${method.returnType || 'unknown'} - ${method.returnDescription}`
      : method.returnType
      ? `\n  Returns: ${method.returnType}`
      : '';

    return `- ${method.name}:
  Description: ${method.description || 'No description available'}${argsInfo}${returnInfo}`;
  }).join('\n\n');

  return `You are a helpful AI assistant that can use tools to help answer user questions.
You have access to various tools that can query cryptocurrency-related data.

## Available Tools

You have access to ${methods.length} tool(s). Each tool has specific capabilities and returns specific types of data. **IMPORTANT**: Before using any tool, understand what it does and what data it returns.

${toolDetails}

## Tool Usage Guidelines

1. **Understand Each Tool First**: Read the tool's description, arguments, and return type before using it. Each tool has a specific purpose - don't use a tool that doesn't match what you need.

2. **Use Tools Iteratively and Intelligently**:
   - If you need data from one tool to query another, use them in sequence (not in parallel)
   - Example: If you need "trading volume of tokens associated with trending NFTs":
     * First call: getTrendingNFTs to get the list of trending NFTs
     * Second call: Use the NFT information from the first call to query getTradingVolume with specific token information
   - Don't blindly query the same thing across all tools - each tool serves a different purpose

3. **Match Tool Purpose to Query**:
   - If a tool is for "swap rates between two currencies", don't use it to get "current prices"
   - If a tool is for "trading volume", use it for volume queries, not price queries
   - Only use tools that are appropriate for the specific information you need

4. **Query Appropriately**:
   - When you have context from a previous tool call, use that context in your query
   - Be specific: Instead of "current price of tokens associated with trending NFTs", first get the trending NFTs, then query prices for those specific tokens
   - Don't repeat the same generic query across multiple tools

5. **Parallel vs Sequential**:
   - Use tools in parallel ONLY when they are independent (don't need each other's results)
   - Use tools sequentially when one tool's output informs another tool's query
   - When in doubt, use tools sequentially to ensure you have the right context

## Example of Intelligent Tool Usage

User asks: "What's the trading volume of tokens associated with trending NFTs?"

WRONG approach:
- Call getTradingVolume with "trading volume of tokens associated with trending NFTs" (you don't know which tokens yet)
- Call getSwapRate with "current price of tokens associated with trending NFTs" (wrong tool for this query)
- Call getTrendingNFTs with "current trending NFTs" (this is correct, but should be done first)

CORRECT approach:
1. First: Call getTrendingNFTs with "current trending NFTs" to get the list
2. Second: Use the NFT information from step 1 to call getTradingVolume with specific token identifiers from the trending NFTs
3. Don't call getSwapRate at all - it's for swap rates, not trading volume

Use the available tools intelligently to provide accurate and helpful responses.`;
}

/**
 * Generates AI response using tool selection and OpenAI
 */
export async function generateResponse(
  chatHistory: ChatMessage[]
): Promise<{ content: string; metadata: MessageMetadata }> {
  console.log(`\n[chat-service] ====================================`);
  console.log(`[chat-service] === Chat Service: Generate Response ===`);
  console.log(`[chat-service] ====================================`);
  console.log(`[chat-service] Chat history: ${chatHistory.length} messages`);

  // Get the latest user message
  const userMessages = chatHistory.filter((msg) => msg.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1];

  if (!latestUserMessage) {
    throw new Error("No user messages found in chat history");
  }

  // Call ToolSelector to get relevant tools
  let toolSelectorResult;
  try {
    toolSelectorResult = await selectTools(
      latestUserMessage.content,
      chatHistory
    );
  } catch (error) {
    console.error("[chat-service] Tool selector failed:", error instanceof Error ? error.message : String(error));
    throw error;
  }

  // Convert tools to OpenAI format
  // Tool selector always returns Method objects (never strings), so we can safely cast
  const selectedMethods = toolSelectorResult.tools as Method[];
  console.log(`[chat-service] Tool selector returned ${toolSelectorResult.tools.length} tool(s), using ${selectedMethods.length} method(s)`);
  
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

  // Call OpenAI with tools
  console.log(`[chat-service] Calling main LLM with ${tools.length} tool(s) available (max iterations: ${MAX_TOOL_ITERATIONS})`);
  const response = await openai.chat.completions.create({
    model: "gpt-5-nano-2025-08-07",
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });

  const assistantMessage = response.choices[0]?.message;
  console.log(`[chat-service] Main LLM response received (tool calls: ${assistantMessage?.tool_calls?.length || 0})`);

  if (!assistantMessage) {
    throw new Error("No assistant message received from OpenAI");
  }

  // Handle tool calls with iterative support
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    let iterationCount = 0;
    let currentMessages: Array<{
      role: "system" | "user" | "assistant" | "tool";
      content: string;
      tool_calls?: any;
      tool_call_id?: string;
      name?: string;
    }> = [...messages];
    let finalContent = "";
    let currentAssistantMessage: typeof assistantMessage = assistantMessage;
    const toolExecutionData: Array<{
      toolName: string;
      query: string;
      processedResult: string;
      executionTimeMs?: number;
      iteration: number;
    }> = [];

    // Iterative tool execution loop
    while (iterationCount < MAX_TOOL_ITERATIONS) {
      iterationCount++;
      
      console.log(`[chat-service] === Tool Execution Phase (Iteration ${iterationCount}/${MAX_TOOL_ITERATIONS}) ===`);
      console.log(`[chat-service] Executing ${currentAssistantMessage.tool_calls!.length} tool call(s)...`);
    
    // Execute all tool calls in parallel
      const toolCallPromises = currentAssistantMessage.tool_calls!.map(async (call, index) => {
      const startTime = Date.now();
      const toolName = 
        "function" in call && call.function && typeof call.function === "object" && "name" in call.function
          ? call.function.name
          : "unknown";

      // Extract query parameter from function arguments
      let query = "";
      if ("function" in call && call.function && typeof call.function === "object" && "arguments" in call.function) {
        try {
          const args = typeof call.function.arguments === "string" 
            ? JSON.parse(call.function.arguments)
            : call.function.arguments;
          query = args.query || "";
        } catch (error) {
          console.error(`[chat-service] ERROR parsing tool arguments:`, error);
          query = "";
        }
      }

      console.log(`[chat-service]   Tool ${index + 1}: ${toolName}`);
      console.log(`[chat-service]   Query: "${query.substring(0, 60)}${query.length > 60 ? "..." : ""}"`);

      // Find the corresponding method
      const method = methodMap.get(toolName);
      if (!method) {
        throw new Error(`Tool ${toolName} not found in method map`);
      }

      // Execute tool with LLM wrapper
      const processedResult = await executeToolWithLLMWrapper(method, query);
      const executionTimeMs = Date.now() - startTime;
      
      console.log(`[chat-service]   Tool ${index + 1}: ✓ Complete (${executionTimeMs}ms)`);
      
        toolExecutionData.push({ toolName, query, processedResult, executionTimeMs, iteration: iterationCount });

      return {
          tool_call_id: "id" in call ? call.id : `call_${iterationCount}_${index}`,
        role: "tool" as const,
        name: toolName,
        content: processedResult,
      };
    });

    const toolResults = await Promise.all(toolCallPromises);
      const iterationToolTime = toolExecutionData
        .filter(t => t.iteration === iterationCount)
        .reduce((sum, t) => sum + (t.executionTimeMs || 0), 0);
      console.log(`[chat-service] Iteration ${iterationCount} tools executed in ${iterationToolTime}ms`);

      // Add assistant message with tool calls and tool results to conversation
      currentMessages.push({
        role: "assistant" as const,
        content: currentAssistantMessage.content || "",
        tool_calls: currentAssistantMessage.tool_calls,
      } as any);
      currentMessages.push(...toolResults);

      // Check if we've reached max iterations
      if (iterationCount >= MAX_TOOL_ITERATIONS) {
        console.log(`[chat-service] Max iterations reached (${MAX_TOOL_ITERATIONS}), generating final response...`);
    const finalResponse = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
          messages: currentMessages as any,
        });
        const finalMessage = finalResponse.choices[0]?.message;
        finalContent = finalMessage?.content || "I executed the tools, but reached the maximum number of iterations.";
        break;
      }

      // Call LLM again to see if it wants to make more tool calls or provide final response
      console.log(`[chat-service] Calling main LLM again (iteration ${iterationCount + 1}) to check for more tool calls or final response...`);
      const nextResponse = await openai.chat.completions.create({
        model: "gpt-5-nano-2025-08-07",
        messages: currentMessages as any,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
      });

      currentAssistantMessage = nextResponse.choices[0]?.message;
      if (!currentAssistantMessage) {
        throw new Error("No assistant message received from OpenAI");
      }

      // If no tool calls, we have the final response
      if (!currentAssistantMessage.tool_calls || currentAssistantMessage.tool_calls.length === 0) {
        finalContent = currentAssistantMessage.content || "I executed the tools, but couldn't generate a final response.";
        console.log(`[chat-service] ✓ Final response generated after ${iterationCount} iteration(s) (${finalContent.length} chars)`);
        break;
      }
    }

    // Build metadata from debug data
    const metadata: any = {};
    if (toolSelectorResult.debugData) {
      metadata.toolSelector = {
        ...toolSelectorResult.debugData,
        selectedTools: selectedMethods.map(m => ({
          slug: m.id,
          name: m.name,
          description: m.description,
        })),
      };
    }
    const totalToolTime = toolExecutionData.reduce((sum, t) => sum + (t.executionTimeMs || 0), 0);
    metadata.mainLLM = {
      maxIterations: MAX_TOOL_ITERATIONS,
      actualIterations: iterationCount,
      toolCallsRequested: toolExecutionData.length,
      toolCallsExecuted: toolExecutionData.length,
      totalExecutionTimeMs: totalToolTime,
      toolCalls: toolExecutionData,
    };

    console.log(`[chat-service] ====================================`);
    console.log(`[chat-service] Response generation complete (WITH TOOLS)`);
    console.log(`[chat-service]   - Tool selector steps: ${metadata.toolSelector?.executionHistory?.length || 0}`);
    console.log(`[chat-service]   - Tools selected: ${metadata.toolSelector?.selectedTools?.length || 0}`);
    console.log(`[chat-service]   - LLM iterations: ${metadata.mainLLM.actualIterations}/${metadata.mainLLM.maxIterations}`);
    console.log(`[chat-service]   - Tool calls executed: ${metadata.mainLLM.toolCallsExecuted}`);
    console.log(`[chat-service]   - Total execution time: ${metadata.mainLLM.totalExecutionTimeMs}ms`);
    console.log(`[chat-service] ====================================`);

    return {
      content: finalContent,
      metadata,
    };
  }

  const responseContent = assistantMessage.content || "I apologize, but I couldn't generate a response.";
  console.log(`[chat-service] ✓ Direct response (no tools used, ${responseContent.length} chars)`);

  // Build metadata from debug data
  const metadata: any = {};
  if (toolSelectorResult.debugData) {
    metadata.toolSelector = {
      ...toolSelectorResult.debugData,
      selectedTools: selectedMethods.map(m => ({
        slug: m.id,
        name: m.name,
        description: m.description,
      })),
    };
  }
  metadata.mainLLM = {
    maxIterations: MAX_TOOL_ITERATIONS,
    actualIterations: 0, // No tool execution needed
    toolCallsRequested: 0,
    toolCallsExecuted: 0,
    totalExecutionTimeMs: 0,
    toolCalls: [],
  };

  console.log(`[chat-service] ====================================`);
  console.log(`[chat-service] Response generation complete (NO TOOLS)`);
  console.log(`[chat-service]   - Tool selector steps: ${metadata.toolSelector?.executionHistory?.length || 0}`);
  console.log(`[chat-service]   - Tools selected: ${metadata.toolSelector?.selectedTools?.length || 0}`);
  console.log(`[chat-service]   - LLM iterations: ${metadata.mainLLM.actualIterations}/${metadata.mainLLM.maxIterations}`);
  console.log(`[chat-service] ====================================`);

  return {
    content: responseContent,
    metadata,
  };
}

