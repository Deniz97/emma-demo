import { TavilyClient } from "tavily";

/**
 * Tavily API client singleton
 * Returns null if API key is not configured
 */
let tavilyClient: TavilyClient | null = null;

export function getTavilyClient(): TavilyClient | null {
  if (tavilyClient) {
    return tavilyClient;
  }

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn(
      "[tavily-client] TAVILY_API_KEY not configured, web search disabled"
    );
    return null;
  }

  tavilyClient = new TavilyClient({ apiKey });
  return tavilyClient;
}

/**
 * Performs a web search using Tavily API
 * Returns search results with summaries and sources
 */
export async function searchWeb(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced";
    includeAnswer?: boolean;
    includeRawContent?: boolean;
  }
): Promise<{
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: string;
    rawContent?: string;
  }>;
  query: string;
} | null> {
  const client = getTavilyClient();
  if (!client) {
    return null;
  }

  try {
    const response = await client.search({
      query,
      max_results: options?.maxResults || 5,
      search_depth: options?.searchDepth || "basic",
      include_answer: options?.includeAnswer !== false, // Default to true
      include_raw_content: options?.includeRawContent || false,
    });

    return {
      answer: response.answer,
      results: (response.results || []).map((result) => ({
        title: result.title || "",
        url: result.url || "",
        content: result.content || "",
        score: result.score || "0",
        rawContent: result.raw_content,
      })),
      query: response.query || query,
    };
  } catch (error) {
    console.error("[tavily-client] Search failed:", error);
    return null;
  }
}
