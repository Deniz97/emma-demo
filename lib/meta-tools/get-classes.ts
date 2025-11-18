import { ClassDto, GetEntityDto } from "@/types/tool-selector";
import { searchClassesByVector } from "./vector-search";

/**
 * Get classes matching search queries using RAG vector search
 */
export async function get_classes(
  dto: GetEntityDto
): Promise<ClassDto[]> {
  const { search_queries, top, threshold = 0.3, categories, apps, classes } = dto;
  
  console.log(`[meta-tools:get-classes] Called with ${search_queries.length} queries, top ${top}, threshold ${threshold}, categories: ${categories?.length || 0}, apps: ${apps?.length || 0}, classes: ${classes?.length || 0}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-classes] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-classes] top <= 0, returning empty array");
    return [];
  }

  if (categories && categories.length > 0) {
    console.log(`[meta-tools:get-classes] Filtering by categories: ${categories.join(", ")}`);
  }
  if (apps && apps.length > 0) {
    console.log(`[meta-tools:get-classes] Filtering by apps: ${apps.join(", ")}`);
  }
  if (classes && classes.length > 0) {
    console.log(`[meta-tools:get-classes] Filtering by classes: ${classes.join(", ")}`);
  }
  console.log(`[meta-tools:get-classes] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchClassesByVector(dto);
    console.log(`[meta-tools:get-classes] Found ${results.length} classes`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-classes] ERROR:", error);
    return [];
  }
}

