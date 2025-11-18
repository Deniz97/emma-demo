import { prisma } from "../prisma";
import { generateEmbedding, vectorToPgVector } from "../embedding-service";
import { AppDto, ClassDto, MethodSummary, MethodDetail } from "@/types/tool-selector";

/**
 * Search apps using vector similarity
 */
export async function searchAppsByVector(
  searchQueries: string[],
  top: number,
  threshold: number = 0.3
): Promise<AppDto[]> {
  console.log(`[meta-tools:vector-search] Searching apps with ${searchQueries.length} queries, top ${top}`);

  if (searchQueries.length === 0 || top === 0) {
    console.log("[meta-tools:vector-search] No search queries or top=0, returning empty");
    return [];
  }

  // Generate embeddings for all search queries
  const queryEmbeddings = await Promise.all(
    searchQueries.map((query) => generateEmbedding(query))
  );

  console.log(`[meta-tools:vector-search] Generated ${queryEmbeddings.length} query embeddings`);

  // Search using vector similarity for each query and combine results
  const allResults: Array<{ slug: string; name: string; description: string | null; similarity: number }> = [];

  for (let i = 0; i < queryEmbeddings.length; i++) {
    const embedding = queryEmbeddings[i];
    const query = searchQueries[i];
    const vectorStr = vectorToPgVector(embedding);

    console.log(`[meta-tools:vector-search] Searching with query "${query.substring(0, 50)}..."`);

    // Search across nameVector, descriptionVector, and metadataVectors
    const sql = `
      WITH metadata_similarities AS (
        SELECT 
          a.id,
          a.slug,
          a.name,
          a.description,
          1 - (ad."nameVector" <=> $1::vector) as name_sim,
          COALESCE(1 - (ad."descriptionVector" <=> $1::vector), 0) as desc_sim,
          (
            SELECT MAX(1 - (mv::vector <=> $1::vector))
            FROM jsonb_array_elements_text(ad."metadataVectors"::jsonb) mv
          ) as metadata_sim
        FROM apps a
        INNER JOIN app_data ad ON a.id = ad."appId"
      )
      SELECT 
        id,
        slug,
        name,
        description,
        GREATEST(name_sim, desc_sim, COALESCE(metadata_sim, 0)) as similarity
      FROM metadata_similarities
      WHERE 
        name_sim > $3
        OR desc_sim > $3
        OR COALESCE(metadata_sim, 0) > $3
      ORDER BY similarity DESC
      LIMIT $2
    `;

    const results = await prisma.$queryRawUnsafe<
      Array<{ id: string; slug: string; name: string; description: string | null; similarity: number }>
    >(sql, vectorStr, top, threshold);

    console.log(`[meta-tools:vector-search] Found ${results.length} results for query "${query.substring(0, 30)}..."`);
    allResults.push(...results);
  }

  // Deduplicate and sort by similarity
  const uniqueApps = new Map<string, AppDto & { similarity: number }>();
  
  for (const result of allResults) {
    if (!uniqueApps.has(result.slug) || uniqueApps.get(result.slug)!.similarity < result.similarity) {
      uniqueApps.set(result.slug, {
        slug: result.slug,
        name: result.name,
        description: result.description,
        similarity: result.similarity,
      });
    }
  }

  // Sort by similarity and take top N
  const sortedApps = Array.from(uniqueApps.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, top)
    .map(({ similarity, ...app }) => app);

  console.log(`[meta-tools:vector-search] Returning ${sortedApps.length} unique apps`);
  return sortedApps;
}

/**
 * Search classes using vector similarity
 */
export async function searchClassesByVector(
  appSlugs: string[],
  searchQueries: string[],
  top: number,
  threshold: number = 0.3
): Promise<ClassDto[]> {
  console.log(`[meta-tools:vector-search] Searching classes with ${searchQueries.length} queries, ${appSlugs.length} app filters, top ${top}`);

  if (searchQueries.length === 0 || top === 0) {
    console.log("[meta-tools:vector-search] No search queries or top=0, returning empty");
    return [];
  }

  // Generate embeddings for all search queries
  const queryEmbeddings = await Promise.all(
    searchQueries.map((query) => generateEmbedding(query))
  );

  console.log(`[meta-tools:vector-search] Generated ${queryEmbeddings.length} query embeddings`);

  const allResults: Array<{ 
    slug: string; 
    name: string; 
    description: string | null; 
    appSlug: string; 
    similarity: number 
  }> = [];

  for (let i = 0; i < queryEmbeddings.length; i++) {
    const embedding = queryEmbeddings[i];
    const query = searchQueries[i];
    const vectorStr = vectorToPgVector(embedding);

    console.log(`[meta-tools:vector-search] Searching classes with query "${query.substring(0, 50)}..."`);

    // Build WHERE clause for app filtering in CTE
    const cteAppFilter = appSlugs.length > 0
      ? `AND a.slug = ANY($4::text[])`
      : "";

    // Search across nameVector, descriptionVector, and metadataVectors
    const sql = `
      WITH metadata_similarities AS (
        SELECT 
          c.id,
          c.slug,
          c.name,
          c.description,
          a.slug as "appSlug",
          1 - (cd."nameVector" <=> $1::vector) as name_sim,
          COALESCE(1 - (cd."descriptionVector" <=> $1::vector), 0) as desc_sim,
          (
            SELECT MAX(1 - (mv::vector <=> $1::vector))
            FROM jsonb_array_elements_text(cd."metadataVectors"::jsonb) mv
          ) as metadata_sim
        FROM classes c
        INNER JOIN class_data cd ON c.id = cd."classId"
        INNER JOIN apps a ON c."appId" = a.id
        WHERE 1=1
        ${cteAppFilter}
      )
      SELECT 
        id,
        slug,
        name,
        description,
        "appSlug",
        GREATEST(name_sim, desc_sim, COALESCE(metadata_sim, 0)) as similarity
      FROM metadata_similarities
      WHERE 
        (name_sim > $3 OR desc_sim > $3 OR COALESCE(metadata_sim, 0) > $3)
      ORDER BY similarity DESC
      LIMIT $2
    `;

    const params = appSlugs.length > 0 
      ? [vectorStr, top, threshold, appSlugs]
      : [vectorStr, top, threshold];

    const results = await prisma.$queryRawUnsafe<
      Array<{ 
        id: string; 
        slug: string; 
        name: string; 
        description: string | null; 
        appSlug: string; 
        similarity: number 
      }>
    >(sql, ...params);

    console.log(`[meta-tools:vector-search] Found ${results.length} classes for query "${query.substring(0, 30)}..."`);
    allResults.push(...results);
  }

  // Deduplicate and sort by similarity
  const uniqueClasses = new Map<string, ClassDto & { similarity: number }>();
  
  for (const result of allResults) {
    if (!uniqueClasses.has(result.slug) || uniqueClasses.get(result.slug)!.similarity < result.similarity) {
      uniqueClasses.set(result.slug, {
        slug: result.slug,
        name: result.name,
        description: result.description,
        appSlug: result.appSlug,
        similarity: result.similarity,
      });
    }
  }

  // Sort by similarity and take top N
  const sortedClasses = Array.from(uniqueClasses.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, top)
    .map(({ similarity, ...cls }) => cls);

  console.log(`[meta-tools:vector-search] Returning ${sortedClasses.length} unique classes`);
  return sortedClasses;
}

/**
 * Search methods using vector similarity
 */
export async function searchMethodsByVector(
  appSlugs: string[],
  classSlugs: string[],
  searchQueries: string[],
  top: number,
  includeFullDetails: boolean = false,
  threshold: number = 0.3
): Promise<MethodSummary[] | MethodDetail[]> {
  console.log(`[meta-tools:vector-search] Searching methods with ${searchQueries.length} queries, ${appSlugs.length} app filters, ${classSlugs.length} class filters, top ${top}, fullDetails: ${includeFullDetails}`);

  if (searchQueries.length === 0 || top === 0) {
    console.log("[meta-tools:vector-search] No search queries or top=0, returning empty");
    return [];
  }

  // Generate embeddings for all search queries
  const queryEmbeddings = await Promise.all(
    searchQueries.map((query) => generateEmbedding(query))
  );

  console.log(`[meta-tools:vector-search] Generated ${queryEmbeddings.length} query embeddings`);

  const allResults: Array<any> = [];

  for (let i = 0; i < queryEmbeddings.length; i++) {
    const embedding = queryEmbeddings[i];
    const query = searchQueries[i];
    const vectorStr = vectorToPgVector(embedding);

    console.log(`[meta-tools:vector-search] Searching methods with query "${query.substring(0, 50)}..."`);

    const cteSelectFields = includeFullDetails
      ? `m.slug, m.name, m.path, m."httpVerb", m.description, m.arguments, m."returnType", m."returnDescription", c.slug as "classSlug", a.slug as "appSlug"`
      : `m.slug, m.name, m.description, c.slug as "classSlug", a.slug as "appSlug"`;

    const outerSelectFields = includeFullDetails
      ? `slug, name, path, "httpVerb", description, arguments, "returnType", "returnDescription", "classSlug", "appSlug"`
      : `slug, name, description, "classSlug", "appSlug"`;

    // Build WHERE clauses for filtering in CTE
    const cteAppFilter = appSlugs.length > 0 ? `AND a.slug = ANY($4::text[])` : "";
    const cteClassFilter = classSlugs.length > 0
      ? appSlugs.length > 0
        ? `AND c.slug = ANY($5::text[])`
        : `AND c.slug = ANY($4::text[])`
      : "";

    const sql = `
      WITH metadata_similarities AS (
        SELECT 
          m.id,
          ${cteSelectFields},
          1 - (md."nameVector" <=> $1::vector) as name_sim,
          COALESCE(1 - (md."descriptionVector" <=> $1::vector), 0) as desc_sim,
          (
            SELECT MAX(1 - (mv::vector <=> $1::vector))
            FROM jsonb_array_elements_text(md."metadataVectors"::jsonb) mv
          ) as metadata_sim
        FROM methods m
        INNER JOIN method_data md ON m.id = md."methodId"
        INNER JOIN classes c ON m."classId" = c.id
        INNER JOIN apps a ON c."appId" = a.id
        WHERE 1=1
        ${cteAppFilter}
        ${cteClassFilter}
      )
      SELECT 
        ${outerSelectFields},
        GREATEST(name_sim, desc_sim, COALESCE(metadata_sim, 0)) as similarity
      FROM metadata_similarities
      WHERE 
        (name_sim > $3 OR desc_sim > $3 OR COALESCE(metadata_sim, 0) > $3)
      ORDER BY similarity DESC
      LIMIT $2
    `;

    const params: any[] = [vectorStr, top, threshold];
    if (appSlugs.length > 0) params.push(appSlugs);
    if (classSlugs.length > 0) params.push(classSlugs);

    const results = await prisma.$queryRawUnsafe<Array<any>>(sql, ...params);

    console.log(`[meta-tools:vector-search] Found ${results.length} methods for query "${query.substring(0, 30)}..."`);
    allResults.push(...results);
  }

  // Deduplicate and sort by similarity
  const uniqueMethods = new Map<string, any>();
  
  for (const result of allResults) {
    if (!uniqueMethods.has(result.slug) || uniqueMethods.get(result.slug)!.similarity < result.similarity) {
      uniqueMethods.set(result.slug, result);
    }
  }

  // Sort by similarity and take top N
  const sortedMethods = Array.from(uniqueMethods.values())
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, top)
    .map(({ similarity, ...method }) => method);

  console.log(`[meta-tools:vector-search] Returning ${sortedMethods.length} unique methods`);
  return sortedMethods;
}

