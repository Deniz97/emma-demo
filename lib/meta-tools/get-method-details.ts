import { MethodDetail, GetEntityDto } from "@/types/tool-selector";
import { searchMethodsByVector } from "./vector-search";

/**
 * Get detailed method information using RAG vector search
 */
export async function get_method_details(
  dto: GetEntityDto
): Promise<MethodDetail[]> {
  const { search_queries, top, threshold = 0.3, categories, apps, classes, methods } = dto;
  
  console.log(`[meta-tools:get-method-details] Called with ${search_queries.length} queries, top ${top}, threshold ${threshold}, categories: ${categories?.length || 0}, apps: ${apps?.length || 0}, classes: ${classes?.length || 0}, methods: ${methods?.length || 0}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-method-details] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-method-details] top <= 0, returning empty array");
    return [];
  }

  if (categories && categories.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by categories: ${categories.join(", ")}`);
  }
  if (apps && apps.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by apps: ${apps.join(", ")}`);
  }
  if (classes && classes.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by classes: ${classes.join(", ")}`);
  }
  if (methods && methods.length > 0) {
    console.log(`[meta-tools:get-method-details] Filtering by methods: ${methods.join(", ")}`);
  }
  console.log(`[meta-tools:get-method-details] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchMethodsByVector(dto, true) as MethodDetail[];
    console.log(`[meta-tools:get-method-details] Found ${results.length} method details`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-method-details] ERROR:", error);
    return [];
  }
}

