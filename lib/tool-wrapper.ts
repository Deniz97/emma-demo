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
  const systemPrompt = `You are a tool execution assistant. Your task is to answer the user's query in natural language based on real web search results.

CRITICAL REQUIREMENTS:

1. **Use Real Search Results**: You have been provided with actual web search results. Base your answer ONLY on the information found in these search results. Do NOT make up or imagine data.

2. **Return Natural Language Answer**: Answer the user's query in natural, conversational language based on the search results. Your response should read like a helpful assistant explaining the results, NOT like raw API output.

3. **Work with Known Parameters**: The tool has specific input parameters. Focus on aspects of the query that match these parameters. If the search results don't contain information about what the user asked, gracefully mention this limitation.

4. **Be Accurate**: Only include information that is actually present in the search results. If you're uncertain, say so. Include specific numbers, names, and details from the search results.

5. **Cite Sources When Relevant**: If specific data points come from particular sources, you can mention them naturally (e.g., "According to CoinGecko..." or "Data from DeFiLlama shows...").

EXAMPLES:

Bad (raw data): {"price": 45000, "currency": "USD"}
Good (natural language): The current price of Bitcoin is $45,000 USD according to the latest market data.

Bad (making up data): The price is $50,000 (when search results show $45,000)
Good (using real data): Based on the search results, the current price of Bitcoin is approximately $45,000 USD.

Your response should:
- Be written in natural, conversational language
- Include specific data points from the search results (numbers, names, etc.)
- Sound like a helpful assistant, not raw API output
- Be clear and easy to read
- Only use information from the provided search results
- Gracefully handle cases where search results don't fully answer the query

Do NOT return JSON, arrays, or raw structured data. Return natural language only.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

Web Search Results:
${searchResults.detailedResults}

Based on the web search results above, answer the user's query in natural, conversational language. Use only the information from the search results. If the search results don't fully answer the query, acknowledge this limitation while providing what information is available.

Remember: Return a natural language answer based on the real search results, NOT raw JSON or structured data.`;

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

  const systemPrompt = `You are a tool execution assistant. Answer the user's query in natural language based on the tool's description and return type. Be honest if you don't have access to real-time data.`;

  const userPrompt = `Tool: ${method.name}
Description: ${method.description || "No description available"}
HTTP Method: ${method.httpVerb}
Path: ${method.path}${argumentsInfo}${returnTypeInfo}

User Query: "${query}"

Note: Web search is currently unavailable. Please provide a helpful response based on general knowledge, but acknowledge that you don't have access to real-time data for this query.`;

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
