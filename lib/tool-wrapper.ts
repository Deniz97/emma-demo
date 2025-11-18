import { openai } from "./openai-client";
import { Method } from "@/types/tool";

/**
 * Mocks HTTP execution of a tool method
 * TODO: Replace with actual HTTP client implementation
 */
async function executeHttpTool(method: Method): Promise<unknown> {
  console.log(`[tool-wrapper] Mocking HTTP execution for method: ${method.name}`);
  console.log(`[tool-wrapper]   HTTP Verb: ${method.httpVerb}`);
  console.log(`[tool-wrapper]   Path: ${method.path}`);
  console.log(`[tool-wrapper]   Arguments: ${JSON.stringify(method.arguments)}`);

  // Mock response - return placeholder data
  const mockResponse = {
    status: 200,
    data: {
      message: `Mock response for ${method.name}`,
      method: method.name,
      path: method.path,
      timestamp: new Date().toISOString(),
    },
  };

  console.log(`[tool-wrapper] Mock HTTP response: ${JSON.stringify(mockResponse)}`);
  return mockResponse;
}

/**
 * Executes a tool with LLM wrapper processing
 * For demo purposes, the LLM simulates tool execution instead of making actual API calls
 */
export async function executeToolWithLLMWrapper(
  method: Method,
  query: string
): Promise<string> {
  console.log("\n[tool-wrapper] ========================================");
  console.log(`[tool-wrapper] executeToolWithLLMWrapper called`);
  console.log(`[tool-wrapper] Method: ${method.name} (${method.id})`);
  console.log(`[tool-wrapper] Query: "${query}"`);

  // For demo: LLM simulates tool execution instead of calling it
  console.log(`[tool-wrapper] LLM will simulate tool execution for demo purposes...`);

  // Prepare prompts for LLM to simulate tool execution
  const systemPrompt = `You are a tool execution assistant in a demo environment. Your task is to ACT AS IF you have executed the tool and provide realistic, helpful responses based on what the tool would return.

IMPORTANT: You are simulating tool execution for demonstration purposes. Generate plausible, realistic responses that would be typical of what this API tool would return. Be specific and detailed, as if you actually called the API.

Your response should:
- Sound natural and informative
- Include specific data points that would be realistic for this type of tool
- Answer the user's query directly
- Be formatted in a clear, easy-to-read way

Do NOT say things like "I would call the API" or "If I had executed this tool". Instead, present your response AS IF you actually executed it and are reporting the results.

Return only the simulated response as plain text. Do not include meta-commentary about this being a simulation.`;

  // Build argument information string
  const argumentsInfo = method.arguments && method.arguments.length > 0
    ? `\nTool Arguments: ${method.arguments.map(arg => `${arg.name} (${arg.type}): ${arg.description}`).join(', ')}`
    : '';

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}
Return Type: ${method.returnType || "Unknown"}${argumentsInfo}

User Query: "${query}"

ACT AS IF you have successfully executed this tool and provide a realistic response that addresses the user's query. Generate specific, plausible data that this tool would typically return.`;

  console.log(`[tool-wrapper] Calling gpt-5-nano-2025-08-07 to simulate tool execution...`);
  console.log(`[tool-wrapper] System prompt length: ${systemPrompt.length} chars`);
  console.log(`[tool-wrapper] User prompt length: ${userPrompt.length} chars`);

  // Call gpt-5-nano-2025-08-07 to simulate the tool execution
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const simulatedResult = response.choices[0]?.message?.content;

    if (!simulatedResult) {
      console.error(`[tool-wrapper] ERROR: No content in LLM response`);
      console.log(`[tool-wrapper] ========================================\n`);
      return `I attempted to use the tool ${method.name}, but couldn't generate a response.`;
    }

    console.log(`[tool-wrapper] LLM simulated result: "${simulatedResult.substring(0, 100)}${simulatedResult.length > 100 ? "..." : ""}"`);
    console.log(`[tool-wrapper] ========================================\n`);

    return simulatedResult;
  } catch (error) {
    console.error(`[tool-wrapper] ERROR calling LLM:`, error);
    console.log(`[tool-wrapper] ========================================\n`);
    return `I encountered an error while trying to use ${method.name}.`;
  }
}

