import { MethodSummary, GetEntityDto } from "@/types/tool-selector";
import { searchMethodsByVector } from "./vector-search";

/**
 * Get methods matching search queries using RAG vector search
 */
export async function get_methods(dto: GetEntityDto): Promise<MethodSummary[]> {
  const {
    search_queries,
    top,
    threshold = 0.3,
    categories,
    apps,
    classes,
    methods,
  } = dto;

  if (search_queries.length === 0 || top <= 0) {
    return [];
  }

  try {
    const results = (await searchMethodsByVector(
      dto,
      false
    )) as MethodSummary[];
    
    const filters = [];
    if (categories?.length) filters.push(`cat:${categories.length}`);
    if (apps?.length) filters.push(`app:${apps.length}`);
    if (classes?.length) filters.push(`cls:${classes.length}`);
    const filterStr = filters.length > 0 ? ` [${filters.join(",")}]` : "";
    
    console.log(
      `[meta-tools:get-methods] ${search_queries.length}q/t${threshold}→${results.length}${filterStr}`
    );
    return results;
  } catch (error) {
    console.error("[meta-tools:get-methods] ERROR:", error);
    return [];
  }
}
