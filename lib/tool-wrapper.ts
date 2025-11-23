import { openai } from "./openai-client";
import { Method } from "@/types/tool";
import { getModel } from "./model-config";
import { webSearchService } from "./web-search-service";

export interface ToolExecutionResult {
  result: string;
  tavilyData?: {
    queries: string[];
    requests: Array<{
      query: string;
      options: {
        maxResults: number;
        searchDepth: "basic" | "advanced";
        includeAnswer: boolean;
      };
    }>;
    responses: Array<{
      answer?: string;
      results: Array<{
        title: string;
        url: string;
        content: string;
        score: string;
        rawContent?: string;
      }>;
      query: string;
    } | null>;
  };
}

/**
 * Executes a tool with LLM wrapper processing
 * Performs web search via Tavily API, then uses LLM to synthesize results into natural language answer
 */
export async function executeToolWithLLMWrapper(
  method: Method,
  query: string
): Promise<ToolExecutionResult> {
  console.log("\n[tool-wrapper] ========================================");
  console.log(`[tool-wrapper] executeToolWithLLMWrapper called`);
  console.log(`[tool-wrapper] Method: ${method.name} (${method.id})`);
  console.log(`[tool-wrapper] Query: "${query}"`);

  // Step 1: Perform web searches via service
  console.log(`[tool-wrapper] Performing web searches...`);

  const searchResults = await webSearchService.searchForTool(method, query, {
    maxResultsPerQuery: 5,
    searchDepth: "basic",
    includeAnswer: true,
  });

  if (!searchResults.hasResults) {
    console.warn(
      `[tool-wrapper] No search results found, falling back to LLM without web data`
    );
    const fallbackResult = await generateResponseWithoutSearch(method, query);
    return {
      result: fallbackResult,
      tavilyData: searchResults.rawSearchData,
    };
  }

  console.log(
    `[tool-wrapper] Found search results (${searchResults.summaryAnswers.length} summary answers, ${searchResults.detailedResults.length} chars of detailed results)`
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

  // Prepare prompts for LLM to synthesize search results into natural language answer
  const systemPrompt = `You are a tool execution assistant. Your task is to answer the user's query in natural language, simulating what the actual API would return.

CRITICAL REQUIREMENTS:

1. **Simulate Realistic API Responses**: You are simulating what the actual API endpoint would return. Always provide a complete, realistic answer that matches what this type of API would return.

2. **Prefer Real Search Results**: When web search results contain relevant information, use that data to ground your response in reality. This makes the simulation more accurate and useful.

3. **Make Up Plausible Data When Needed**: If search results don't contain the specific information requested, generate realistic, plausible data that fits the tool's expected output format. Never say "no data available" or "information not found" - instead, provide reasonable values that an API would return.

4. **Return Numeric and Specific Data**: Always include concrete numbers, percentages, dates, timestamps, and specific values. Avoid vague descriptions. APIs return precise data, not general statements.

5. **Return Natural Language Answer**: Answer the user's query in natural, conversational language. Your response should read like a helpful assistant explaining the results, NOT like raw API output or JSON.

6. **Match Expected Output Format**: The tool has a specific return type and expected output format. Your answer should reflect the kind of data this API would provide, including appropriate numbers, names, dates, and other details.

7. **Cite Sources When Available**: If you're using information from the search results, you can mention sources naturally (e.g., "According to CoinGecko..." or "Data from DeFiLlama shows...").

EXAMPLES:

Bad (raw data): {"price": 45000, "currency": "USD"}
Good (natural language with specific data): The current price of Bitcoin is $45,000 USD according to the latest market data.

Bad (vague): Ethereum has high trading volume.
Good (specific numbers): The current trading volume for Ethereum is approximately $15.2 billion over the last 24 hours, with a market cap of around $245 billion.

Bad (saying no data): I don't have access to that information right now.
Good (specific plausible data): Bitcoin's 24-hour price change is +3.2%, with a high of $45,800 and a low of $43,200. The current circulating supply is 19.6 million BTC.

Your response should:
- Be written in natural, conversational language
- Always include specific numbers, percentages, dates, and concrete values
- Always provide a complete answer (never say data is unavailable)
- Use real search data when available to be more accurate
- Generate plausible, specific data when search results don't contain exact values
- Include realistic numbers, names, dates, and precise details
- Sound like a helpful assistant, not raw API output
- Match what the actual API endpoint would return

Do NOT return JSON, arrays, or raw structured data. Return natural language only.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

Web Search Results:
${searchResults.detailedResults}

Based on the web search results above, answer the user's query in natural, conversational language. Use the search results to ground your response in reality whenever possible. If the search results don't contain specific data points needed to fully answer the query, generate realistic, plausible values that fit the expected output format.

Remember: 
- Always provide a complete answer simulating what the API would return
- Include specific numbers, percentages, dates, and concrete values
- Use search data when available to be accurate
- Fill in missing details with realistic, specific numeric values
- Provide multiple relevant data points when appropriate
- Return natural language, NOT raw JSON or structured data`;

  // Step 2: Generate natural language answer using LLM with search results
  const model = getModel("toolWrapper");
  console.log(
    `[tool-wrapper] Calling ${model} to synthesize search results into natural language answer...`
  );
  console.log(
    `[tool-wrapper] System prompt length: ${systemPrompt.length} chars`
  );
  console.log(`[tool-wrapper] User prompt length: ${userPrompt.length} chars`);

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
      return {
        result: `I attempted to use the tool ${method.name}, but couldn't generate a response.`,
        tavilyData: searchResults.rawSearchData,
      };
    }

    console.log(
      `[tool-wrapper] Natural language answer: "${naturalLanguageAnswer.substring(
        0,
        100
      )}${naturalLanguageAnswer.length > 100 ? "..." : ""}"`
    );
    console.log(`[tool-wrapper] ========================================\n`);

    return {
      result: naturalLanguageAnswer,
      tavilyData: searchResults.rawSearchData,
    };
  } catch (error) {
    console.error(`[tool-wrapper] ERROR calling LLM:`, error);
    console.log(`[tool-wrapper] ========================================\n`);
    return {
      result: `I encountered an error while trying to use ${method.name}.`,
      tavilyData: searchResults.rawSearchData,
    };
  }
}

/**
 * Fallback function when web search is unavailable
 * Uses the original "imagine data" approach
 */
async function generateResponseWithoutSearch(
  method: Method,
  query: string
): Promise<string> {
  console.log(
    `[tool-wrapper] Using fallback: LLM will generate response without web search data`
  );

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

  const systemPrompt = `You are a tool execution assistant. Your task is to simulate what the actual API endpoint would return, providing realistic, plausible data based on the tool's description and expected output format.

CRITICAL REQUIREMENTS:

1. **Always Provide Complete Data**: Never say data is unavailable or that you lack access. Always simulate a realistic API response with plausible values.

2. **Return Numeric and Specific Data**: Always include concrete numbers, percentages, dates, timestamps, and specific values. APIs return precise data, not vague descriptions. Include multiple data points when appropriate.

3. **Match Expected Output Format**: Use the tool's return type and description to generate appropriate data. Include realistic numbers, names, dates, and other details that match what this API would return.

4. **Be Realistic**: Generate data that makes sense for the type of API (cryptocurrency prices, market data, blockchain info, etc.). Use reasonable ranges and current market context.

5. **Return Natural Language**: Answer in conversational language, not raw JSON or structured data. Explain the results like a helpful assistant.

6. **Be Confident**: Present the simulated data confidently, as if it came from the actual API. Don't mention that the data is simulated or that search is unavailable.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

Generate a realistic, plausible response based on what this API endpoint would return. Include specific numeric data, precise values, percentages, dates, and concrete details that match the expected output format. Provide multiple relevant data points when appropriate.`;

  const model = getModel("toolWrapper");
  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  return (
    response.choices[0]?.message?.content ||
    `I attempted to use the tool ${method.name}, but couldn't generate a response.`
  );
}
