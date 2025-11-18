import { AppDto } from "@/types/tool-selector";
import { searchAppsByVector } from "./vector-search";

/**
 * Get apps matching search queries using RAG vector search
 */
export async function get_apps(
  search_queries: string[],
  top: number,
  threshold: number = 0.3
): Promise<AppDto[]> {
  console.log(`[meta-tools:get-apps] Called with ${search_queries.length} queries, top ${top}, threshold ${threshold}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-apps] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-apps] top <= 0, returning empty array");
    return [];
  }

  console.log(`[meta-tools:get-apps] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchAppsByVector(search_queries, top, threshold);
    console.log(`[meta-tools:get-apps] Found ${results.length} apps`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-apps] ERROR:", error);
    return [];
  }
}

