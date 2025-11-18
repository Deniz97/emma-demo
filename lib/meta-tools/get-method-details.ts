import { MethodDetail } from "@/types/tool-selector";
import { searchMethodsByVector } from "./vector-search";

/**
 * Get detailed method information using RAG vector search
 */
export async function get_method_details(
  apps: string[],
  classes: string[],
  method_ids: string[],
  search_queries: string[],
  top: number,
  threshold: number = 0.3
): Promise<MethodDetail[]> {
  console.log(`[meta-tools:get-method-details] Called with ${apps.length} app filters, ${classes.length} class filters, ${method_ids.length} method filters, ${search_queries.length} queries, top ${top}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-method-details] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-method-details] top <= 0, returning empty array");
    return [];
  }

  if (apps.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by apps: ${apps.join(", ")}`);
  }
  if (classes.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by classes: ${classes.join(", ")}`);
  }
  if (method_ids.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by method IDs: ${method_ids.join(", ")}`);
  }
  console.log(`[meta-tools:get-method-details] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchMethodsByVector(apps, classes, search_queries, top, true, threshold) as MethodDetail[];
    console.log(`[meta-tools:get-method-details] Found ${results.length} method details`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-method-details] ERROR:", error);
    return [];
  }
}

