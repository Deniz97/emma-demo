import { MethodSummary, GetEntityDto } from "@/types/tool-selector";
import { searchMethodsByVector } from "./vector-search";

/**
 * Get methods matching search queries using RAG vector search
 */
export async function get_methods(
  dto: GetEntityDto
): Promise<MethodSummary[]> {
  const { search_queries, top, threshold = 0.3, categories, apps, classes, methods } = dto;
  
  console.log(`[meta-tools:get-methods] Called with ${search_queries.length} queries, top ${top}, threshold ${threshold}, categories: ${categories?.length || 0}, apps: ${apps?.length || 0}, classes: ${classes?.length || 0}, methods: ${methods?.length || 0}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-methods] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-methods] top <= 0, returning empty array");
    return [];
  }

  if (categories && categories.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by categories: ${categories.join(", ")}`);
  }
  if (apps && apps.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by apps: ${apps.join(", ")}`);
  }
  if (classes && classes.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by classes: ${classes.join(", ")}`);
  }
  if (methods && methods.length > 0) {
    console.log(`[meta-tools:get-methods] Filtering by methods: ${methods.join(", ")}`);
  }
  console.log(`[meta-tools:get-methods] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchMethodsByVector(dto, false) as MethodSummary[];
    console.log(`[meta-tools:get-methods] Found ${results.length} methods`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-methods] ERROR:", error);
    return [];
  }
}

