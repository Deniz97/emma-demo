import { openai } from "./openai-client";
import { Method } from "@/types/tool";
import { getModel } from "./model-config";

/**
 * Executes a tool with LLM wrapper processing
 * For demo purposes, a single LLM call imagines realistic API data and returns a natural language answer
 * (In production, this would make an actual HTTP call and then use LLM to summarize the JSON response)
 */
export async function executeToolWithLLMWrapper(
  method: Method,
  query: string
): Promise<string> {
  console.log("\n[tool-wrapper] ========================================");
  console.log(`[tool-wrapper] executeToolWithLLMWrapper called`);
  console.log(`[tool-wrapper] Method: ${method.name} (${method.id})`);
  console.log(`[tool-wrapper] Query: "${query}"`);

  // For demo: Single LLM call imagines data and returns natural language answer
  console.log(
    `[tool-wrapper] LLM will imagine realistic data and return natural language answer...`
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

  // Prepare prompts for LLM to simulate tool execution and return natural language answer
  const systemPrompt = `You are a tool execution assistant in a demo environment. Your task is to answer the user's query in natural language by imagining realistic data that would come from the API tool.

CRITICAL REQUIREMENTS:

1. **Imagine Realistic Data Internally**: Based on the tool's return type and description, imagine what realistic data the API would return. Keep this data in your mind, but DO NOT output raw JSON or structured data.

2. **Return Natural Language Answer**: Answer the user's query in natural, conversational language based on the imagined data. Your response should read like a helpful assistant explaining the results, NOT like raw API output.

3. **Work with Known Parameters**: The tool has specific input parameters. Focus on aspects of the query that match these parameters. If the query asks for something the tool cannot provide (e.g., historical data when only current data is available), gracefully mention this limitation while still providing what you can.

4. **Be Specific and Realistic**: Include specific numbers, names, and details that would be realistic for this type of tool. Make the data plausible for the current date and context.

EXAMPLES:

Bad (raw data): {"price": 45000, "currency": "USD"}
Good (natural language): The current price of Bitcoin is $45,000 USD.

Bad (raw data): [{"name": "Uniswap", "tvl": 21430000000}, ...]
Good (natural language): The total TVL across DeFi platforms is approximately $77.38 billion. The largest platforms by TVL are Uniswap ($21.43B), Curve ($18.75B), and MakerDAO ($12.1B).

Your response should:
- Be written in natural, conversational language
- Include specific data points (numbers, names, etc.)
- Sound like a helpful assistant, not raw API output
- Be clear and easy to read
- Gracefully handle limitations when necessary

Do NOT return JSON, arrays, or raw structured data. Return natural language only.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

Based on the tool's return type and description, imagine realistic data that would come from this API. Then answer the user's query in natural, conversational language using that imagined data. Include specific numbers and details to make your answer realistic and helpful.

Remember: Return a natural language answer, NOT raw JSON or structured data.`;

  const model = getModel("toolWrapper");
  console.log(
    `[tool-wrapper] Calling ${model} to generate natural language answer...`
  );
  console.log(
    `[tool-wrapper] System prompt length: ${systemPrompt.length} chars`
  );
  console.log(`[tool-wrapper] User prompt length: ${userPrompt.length} chars`);

  // Call model to generate natural language answer
  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const naturalLanguageAnswer = response.choices[0]?.message?.content;

    if (!naturalLanguageAnswer) {
      console.error(`[tool-wrapper] ERROR: No content in LLM response`);
      console.log(`[tool-wrapper] ========================================\n`);
      return `I attempted to use the tool ${method.name}, but couldn't generate a response.`;
    }

    console.log(
      `[tool-wrapper] Natural language answer: "${naturalLanguageAnswer.substring(
        0,
        100
      )}${naturalLanguageAnswer.length > 100 ? "..." : ""}"`
    );
    console.log(`[tool-wrapper] ========================================\n`);

    return naturalLanguageAnswer;
  } catch (error) {
    console.error(`[tool-wrapper] ERROR calling LLM:`, error);
    console.log(`[tool-wrapper] ========================================\n`);
    return `I encountered an error while trying to use ${method.name}.`;
  }
}
