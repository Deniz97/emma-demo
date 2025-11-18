import { ClassDto } from "@/types/tool-selector";
import { searchClassesByVector } from "./vector-search";

/**
 * Get classes matching search queries using RAG vector search
 */
export async function get_classes(
  apps: string[],
  search_queries: string[],
  top: number,
  threshold: number = 0.3
): Promise<ClassDto[]> {
  console.log(`[meta-tools:get-classes] Called with ${apps.length} app filters, ${search_queries.length} queries, top ${top}, threshold ${threshold}`);
  
  if (search_queries.length === 0) {
    console.log("[meta-tools:get-classes] No search queries provided, returning empty array");
    return [];
  }

  if (top <= 0) {
    console.log("[meta-tools:get-classes] top <= 0, returning empty array");
    return [];
  }

  if (apps.length > 0) {
    console.log(`[meta-tools:get-classes] Filtering by apps: ${apps.join(", ")}`);
  }
  console.log(`[meta-tools:get-classes] Search queries: ${search_queries.map(q => `"${q.substring(0, 30)}..."`).join(", ")}`);

  try {
    const results = await searchClassesByVector(apps, search_queries, top, threshold);
    console.log(`[meta-tools:get-classes] Found ${results.length} classes`);
    return results;
  } catch (error) {
    console.error("[meta-tools:get-classes] ERROR:", error);
    return [];
  }
}

