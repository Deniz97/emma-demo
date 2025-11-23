import { Method } from "@/types/tool";
import { searchWeb } from "./tavily-client";

export interface WebSearchResult {
  answer?: string;
  results: Array<{
    title: string;
    url: string;
    content: string;
    score: string;
    rawContent?: string;
  }>;
  query: string;
}

export interface FormattedSearchResults {
  summaryAnswers: string[];
  detailedResults: string;
  hasResults: boolean;
  rawSearchData?: {
    queries: string[];
    requests: Array<{
      query: string;
      options: {
        maxResults: number;
        searchDepth: "basic" | "advanced";
        includeAnswer: boolean;
      };
    }>;
    responses: Array<WebSearchResult | null>;
  };
}

/**
 * Web search service for tool execution
 * Handles search query generation, execution, and result formatting
 */
export class WebSearchService {
  /**
   * Performs web searches for a tool execution
   * Generates multiple search queries and executes them in parallel
   */
  async searchForTool(
    method: Method,
    userQuery: string,
    options?: {
      maxResultsPerQuery?: number;
      searchDepth?: "basic" | "advanced";
      includeAnswer?: boolean;
    }
  ): Promise<FormattedSearchResults> {
    // Generate search queries from tool context and user query
    const searchQueries = this.generateSearchQueries(method, userQuery);

    // Prepare search options
    const searchOptions = {
      maxResults: options?.maxResultsPerQuery || 5,
      searchDepth: (options?.searchDepth || "basic") as "basic" | "advanced",
      includeAnswer: options?.includeAnswer !== false, // Default to true
    };

    // Track raw request data
    const requests = searchQueries.map((query) => ({
      query,
      options: searchOptions,
    }));

    // Perform searches in parallel
    const searchResults = await Promise.all(
      searchQueries.map((searchQuery) => searchWeb(searchQuery, searchOptions))
    );

    // Filter out null results
    const validResults = searchResults.filter(
      (result): result is WebSearchResult => result !== null
    );

    if (validResults.length === 0) {
      return {
        summaryAnswers: [],
        detailedResults: "",
        hasResults: false,
        rawSearchData: {
          queries: searchQueries,
          requests,
          responses: searchResults,
        },
      };
    }

    // Format results for LLM consumption
    const formatted = this.formatSearchResults(validResults);
    return {
      ...formatted,
      rawSearchData: {
        queries: searchQueries,
        requests,
        responses: searchResults,
      },
    };
  }

  /**
   * Generates search queries from tool context and user query
   * Returns an array of search query strings
   */
  private generateSearchQueries(method: Method, query: string): string[] {
    const queries: string[] = [];

    // Primary query: combine tool name/description with user query
    const primaryQuery = `${method.name} ${query}`.trim();
    queries.push(primaryQuery);

    // If tool has a specific description, add a more focused query
    if (method.description) {
      const focusedQuery = `${method.description} ${query}`.trim();
      if (focusedQuery !== primaryQuery) {
        queries.push(focusedQuery);
      }
    }

    // If query is very short, add a more specific query with tool context
    if (query.length < 20 && method.description) {
      queries.push(`${method.description} ${method.name} ${query}`.trim());
    }

    // Deduplicate and limit to 3 queries max
    return Array.from(new Set(queries)).slice(0, 3);
  }

  /**
   * Formats search results for LLM consumption
   */
  private formatSearchResults(
    searchResults: WebSearchResult[]
  ): FormattedSearchResults {
    // Extract answer summaries
    const summaryAnswers = searchResults
      .map((r) => r.answer)
      .filter((a): a is string => !!a);

    // Format detailed results
    let detailedResults = "";

    if (summaryAnswers.length > 0) {
      detailedResults += "Summary Answers:\n";
      summaryAnswers.forEach((answer, idx) => {
        detailedResults += `${idx + 1}. ${answer}\n`;
      });
      detailedResults += "\n";
    }

    // Include detailed results
    detailedResults += "Detailed Results:\n\n";
    searchResults.forEach((searchResult, searchIdx) => {
      if (searchResult.results.length > 0) {
        detailedResults += `Search Query: "${searchResult.query}"\n`;
        searchResult.results.forEach((result, idx) => {
          detailedResults += `\n${searchIdx + 1}.${idx + 1} ${result.title}\n`;
          detailedResults += `   URL: ${result.url}\n`;
          detailedResults += `   Relevance Score: ${result.score}\n`;
          detailedResults += `   Content: ${result.content.substring(0, 500)}${
            result.content.length > 500 ? "..." : ""
          }\n`;
        });
        detailedResults += "\n";
      }
    });

    return {
      summaryAnswers,
      detailedResults: detailedResults.trim(),
      hasResults: true,
    };
  }
}

// Export singleton instance
export const webSearchService = new WebSearchService();
