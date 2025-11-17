import { MethodSummary } from "@/types/tool-selector";
import { searchMethodsByVector } from "./vector-search";

/**
 * Get methods matching search queries using RAG vector search
 */
export async function get_methods(
  apps: string[],
  classes: string[],
  search_queries: string[],
  top: number
): Promise<MethodSummary[]> {
  console.log(`[meta-tools:get-methods] Called with ${apps.length} app filters, ${classes.length} class filters, ${search_queries.length} queries, top ${top}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-methods] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-methods] top <= 0, returning empty array");
    return [];
  }

  if (apps.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by apps: ${apps.join(", ")}`);
  }
  if (classes.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by classes: ${classes.join(", ")}`);
  }
  console.log(`[meta-tools:get-methods] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchMethodsByVector(apps, classes, search_queries, top, false) as MethodSummary[];
    console.log(`[meta-tools:get-methods] Found ${results.length} methods`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-methods] ERROR:", error);
    return [];
  }
}

