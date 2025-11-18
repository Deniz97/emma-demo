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
 * Generates AI response using tool selection and OpenAI
 */
export async function generateResponse(
  chatHistory: ChatMessage[]
): Promise<{ content: string; metadata: MessageMetadata }> {
  console.log(`[chat-service] Generating response (${chatHistory.length} messages)`);

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
  const selectedMethods = toolSelectorResult.tools.length > 0 &&
    typeof toolSelectorResult.tools[0] !== "string"
      ? (toolSelectorResult.tools as Method[])
      : [];
  const tools = convertMethodsToOpenAITools(selectedMethods);

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

  // Call OpenAI with tools
  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? "auto" : undefined,
  });

  const assistantMessage = response.choices[0]?.message;

  if (!assistantMessage) {
    throw new Error("No assistant message received from OpenAI");
  }

  // Handle tool calls if any
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    console.log(`[chat-service] Executing ${assistantMessage.tool_calls.length} tool call(s)`);
    
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

      // Find the corresponding method
      const method = methodMap.get(toolName);
      if (!method) {
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

