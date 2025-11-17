import { openai } from "./openai-client";
import { selectTools } from "./tool-selector";
import { ChatMessage, MessageMetadata } from "@/types/chat";
import { Method } from "@/types/tool";
import { executeToolWithLLMWrapper } from "./tool-wrapper";

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
  console.log(`[chat-service] Converting ${methods.length} methods to OpenAI tool format`);
  
  const result = methods.map((method) => ({
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

  console.log(`[chat-service] Converted ${result.length} methods to OpenAI tools`);
  return result;
}

/**
 * Generates AI response using tool selection and OpenAI
 */
export async function generateResponse(
  chatHistory: ChatMessage[]
): Promise<{ content: string; metadata: MessageMetadata }> {
  console.log("\n[chat-service] ========================================");
  console.log("[chat-service] generateResponse called");
  console.log(`[chat-service] Chat history length: ${chatHistory.length} messages`);

  // Get the latest user message
  const userMessages = chatHistory.filter((msg) => msg.role === "user");
  const latestUserMessage = userMessages[userMessages.length - 1];

  if (!latestUserMessage) {
    console.error("[chat-service] ERROR: No user messages found");
    console.log("[chat-service] ========================================\n");
    throw new Error("No user messages found in chat history");
  }

  console.log(`[chat-service] Latest user message: "${latestUserMessage.content.substring(0, 100)}${latestUserMessage.content.length > 100 ? "..." : ""}"`);

  // Call ToolSelector to get relevant tools
  console.log("[chat-service] Calling tool selector...");
  const toolSelectorResult = await selectTools(
    latestUserMessage.content,
    chatHistory
  );
  console.log(`[chat-service] Tool selector returned ${toolSelectorResult.tools.length} tools`);
  if (toolSelectorResult.reasoning) {
    console.log(`[chat-service] Tool selector reasoning: ${toolSelectorResult.reasoning}`);
  }

  // Convert tools to OpenAI format
  console.log("[chat-service] Converting tools to OpenAI format...");
  const selectedMethods = toolSelectorResult.tools.length > 0 &&
    typeof toolSelectorResult.tools[0] !== "string"
      ? (toolSelectorResult.tools as Method[])
      : [];
  const tools = convertMethodsToOpenAITools(selectedMethods);
  console.log(`[chat-service] Converted to ${tools.length} OpenAI tools`);

  // Create a mapping of tool names to methods for later lookup
  const methodMap = new Map<string, Method>();
  selectedMethods.forEach((method) => {
    methodMap.set(method.name, method);
  });

  // Prepare messages for OpenAI
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    {
      role: "system",
      content: `You are a helpful AI assistant that can use tools to help answer user questions.
You have access to various tools that can query cryptocurrency-related data.
Use the available tools when appropriate to provide accurate and helpful responses.`,
    },
    ...chatHistory.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    })),
  ];

  console.log(`[chat-service] Prepared ${messages.length} messages for OpenAI`);
  console.log(`[chat-service] Calling OpenAI API (model: gpt-4-turbo-preview, tools: ${tools.length > 0 ? "enabled" : "disabled"})...`);

  // Call OpenAI with tools
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });

  console.log("[chat-service] OpenAI API response received");
  const assistantMessage = response.choices[0]?.message;

  if (!assistantMessage) {
    console.error("[chat-service] ERROR: No assistant message in OpenAI response");
    console.log("[chat-service] ========================================\n");
    throw new Error("No assistant message received from OpenAI");
  }

  // Handle tool calls if any
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    console.log(`[chat-service] Assistant requested ${assistantMessage.tool_calls.length} tool call(s):`);
    
    // Track tool execution metadata
    const toolExecutionData: Array<{
      toolName: string;
      query: string;
      processedResult: string;
    }> = [];
    
    // Execute all tool calls in parallel
    const toolCallPromises = assistantMessage.tool_calls.map(async (call, index) => {
      const toolName = 
        "function" in call && call.function && typeof call.function === "object" && "name" in call.function
          ? call.function.name
          : "unknown";
      console.log(`[chat-service]   Tool call ${index + 1}: ${toolName}`);

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

      console.log(`[chat-service]     Query: "${query}"`);

      // Find the corresponding method
      const method = methodMap.get(toolName);
      if (!method) {
        console.error(`[chat-service] ERROR: Method not found for tool: ${toolName}`);
        throw new Error(`Tool ${toolName} not found in method map`);
      }

      // Execute tool with LLM wrapper
      const processedResult = await executeToolWithLLMWrapper(method, query);
      toolExecutionData.push({ toolName, query, processedResult });

      return {
        tool_call_id: "id" in call ? call.id : `call_${index}`,
        role: "tool" as const,
        name: toolName,
        content: processedResult,
      };
    });

    const toolResults = await Promise.all(toolCallPromises);

    console.log(`[chat-service] Executed ${toolResults.length} tool call(s), sending results back to OpenAI...`);

    // Add tool results to messages and get final response
    const messagesWithToolResults = [
      ...messages,
      {
        role: "assistant" as const,
        content: assistantMessage.content || "",
        tool_calls: assistantMessage.tool_calls,
      },
      ...toolResults,
    ];

    const finalResponse = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: messagesWithToolResults as any,
    });

    const finalMessage = finalResponse.choices[0]?.message;
    const finalContent = finalMessage?.content || "I executed the tools, but couldn't generate a final response.";

    console.log(`[chat-service] Final response: "${finalContent.substring(0, 100)}${finalContent.length > 100 ? "..." : ""}"`);
    console.log("[chat-service] ========================================\n");

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
    metadata.toolExecution = {
      toolCalls: toolExecutionData,
    };

    return {
      content: finalContent,
      metadata,
    };
  }

  const responseContent = assistantMessage.content || "I apologize, but I couldn't generate a response.";
  console.log(`[chat-service] Assistant response: "${responseContent.substring(0, 100)}${responseContent.length > 100 ? "..." : ""}"`);
  console.log("[chat-service] ========================================\n");

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

  return {
    content: responseContent,
    metadata,
  };
}

