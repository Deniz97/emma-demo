import { openai } from "./openai-client";
import { Method } from "@/types/tool";

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
  console.log(
    `[tool-wrapper] LLM will simulate tool execution for demo purposes...`
  );

  // Build detailed argument information (matching format from tool description)
  const argumentsInfo =
    method.arguments && method.arguments.length > 0
      ? `\n\nSupported Inputs: This tool accepts queries that reference the following parameters:
${method.arguments
  .map(
    (arg) =>
      `  - ${arg.name} (${arg.type}): ${arg.description || "No description"}`
  )
  .join("\n")}`
      : "";

  const returnTypeInfo = method.returnType
    ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following type and format: ${
        method.returnType
      }${method.returnDescription ? ` - ${method.returnDescription}` : ""}`
    : method.returnDescription
    ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following format: ${method.returnDescription}`
    : "";

  // Prepare prompts for LLM to simulate tool execution
  const systemPrompt = `You are a tool execution assistant in a demo environment. Your task is to ACT AS IF you have executed the tool and provide realistic, helpful responses based on what the tool would return.

CRITICAL REQUIREMENTS:

1. **Work with Known Parameters Only**: The tool has specific input parameters defined. Focus ONLY on aspects of the query that match these known parameters. You do NOT need to fail or reject queries that mention unknown parameters. Instead:
   - Extract and work with the parts of the query that match known parameters
   - Gracefully handle requests for data you cannot provide (due to missing parameters or capabilities)
   - Example: If the tool only accepts "token" parameter and the query asks "the price of bitcoin last week", respond with: "Here is the price of bitcoin. I only have the latest information available, so I cannot fetch data from last week."
   - Only be sensitive and make decisions about the KNOWN parameters - ignore unknown ones

2. **Respect Return Type**: The tool returns a specific type of data. Your response MUST match this return type exactly and only include data that could realistically come from the actual API:
   - If the return type is an object, return structured data matching that object's expected shape
   - If the return type is an array, return an array of the specified element type
   - If the return type is a string, return a string
   - If the return type is a number, return numeric data
   - Do NOT return data types that don't match the specified return type
   - Only generate data that conforms to what the actual API could return

3. **Response Format**: Generate plausible, realistic responses that would be typical of what this API tool would return. Be specific and detailed, as if you actually called the API. Your response should sound like a real API response, not a simulation.

4. **Handle Limitations Gracefully**: If the query asks for something the tool cannot provide (due to missing parameters, time ranges, etc.), include that information naturally in your response while still providing what you can. Do not reject the entire query - work with what you have.

Your response should:
- Sound natural and informative, like a real API response
- Include specific data points that would be realistic for this type of tool
- Work with known parameters from the query
- Gracefully mention limitations when the query asks for unavailable data
- Be formatted in a clear, easy-to-read way
- **Match the exact return type specified for this tool**
- **Only include data that could realistically come from the actual API**

Do NOT say things like "I would call the API" or "If I had executed this tool". Instead, present your response AS IF you actually executed it and are reporting the results.

Return only the simulated response as plain text. Do not include meta-commentary about this being a simulation.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

ACT AS IF you have successfully executed this tool and provide a realistic response that:
1. Works with aspects of the query that match the tool's known parameters (see Supported Inputs above)
2. Gracefully handles requests for data the tool cannot provide (due to missing parameters or capabilities)
3. Returns data that matches the exact return type specified above (see Expected Output above)
4. Only includes data that could realistically come from the actual API

Generate specific, plausible data that this tool would typically return, ensuring it matches the return type exactly and only contains data that conforms to what the actual API could return.`;

  console.log(
    `[tool-wrapper] Calling gpt-5-nano-2025-08-07 to simulate tool execution...`
  );
  console.log(
    `[tool-wrapper] System prompt length: ${systemPrompt.length} chars`
  );
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

    console.log(
      `[tool-wrapper] LLM simulated result: "${simulatedResult.substring(
        0,
        100
      )}${simulatedResult.length > 100 ? "..." : ""}"`
    );
    console.log(`[tool-wrapper] ========================================\n`);

    return simulatedResult;
  } catch (error) {
    console.error(`[tool-wrapper] ERROR calling LLM:`, error);
    console.log(`[tool-wrapper] ========================================\n`);
    return `I encountered an error while trying to use ${method.name}.`;
  }
}
