import { prisma } from "./prisma";
import {
  generateEmbedding,
  generateEmbeddings,
  vectorToPgVector,
} from "./embedding-service";
import {
  generateAppMetadata,
  generateClassMetadata,
  generateMethodMetadata,
} from "./metadata-service";

/**
 * Populate vector data for an App
 */
export async function populateAppData(appId: string): Promise<void> {
  const app = await prisma.app.findUnique({
    where: { id: appId },
  });

  if (!app) {
    throw new Error(`App with id ${appId} not found`);
  }

  console.log(`Generating vectors for app: ${app.name}`);

  // Generate embeddings for name and description
  const nameVector = await generateEmbedding(app.name);
  const descriptionVector = app.description
    ? await generateEmbedding(app.description)
    : null;

  // Generate metadata using LLM
  const metadata = await generateAppMetadata(app);

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter(
    (v) => v && v.trim().length > 0
  );

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: {
    keys: string[];
    values: string[];
    vectors: number[][];
  } = {
    keys: [],
    values: [],
    vectors: [],
  };

  metadataKeys.forEach((key, index) => {
    const value = metadata[key];
    if (value && value.trim().length > 0 && metadataVectors[index]) {
      validMetadata.keys.push(key);
      validMetadata.values.push(value);
      validMetadata.vectors.push(metadataVectors[index]);
    }
  });

  // Store using raw SQL since Prisma doesn't fully support vector types
  const nameVectorStr = vectorToPgVector(nameVector);
  const descriptionVectorStr = descriptionVector
    ? vectorToPgVector(descriptionVector)
    : null;

  // Build query with proper parameterization - always include description parameter
  const query = `
    INSERT INTO app_data (
      id, "appId", "nameVector", "descriptionVector", 
      "metadataKeys", "metadataValues", "metadataVectors", 
      "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1,
      $2::vector,
      $3::vector,
      $4::text[],
      $5::jsonb,
      $6::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT ("appId") 
    DO UPDATE SET
      "nameVector" = EXCLUDED."nameVector",
      "descriptionVector" = EXCLUDED."descriptionVector",
      "metadataKeys" = EXCLUDED."metadataKeys",
      "metadataValues" = EXCLUDED."metadataValues",
      "metadataVectors" = EXCLUDED."metadataVectors",
      "updatedAt" = NOW()
  `;

  // Format arrays properly for PostgreSQL
  const metadataKeysArray = `{${validMetadata.keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",")}}`;
  const metadataValuesJson = JSON.stringify(validMetadata.values);
  const metadataVectorsJson = JSON.stringify(validMetadata.vectors);

  await prisma.$executeRawUnsafe(
    query,
    appId,
    nameVectorStr,
    descriptionVectorStr,
    metadataKeysArray,
    metadataValuesJson,
    metadataVectorsJson
  );

  console.log(`✓ Completed vectors for app: ${app.name}`);
}

/**
 * Populate vector data for a Class
 */
export async function populateClassData(classId: string): Promise<void> {
  const class_ = await prisma.class.findUnique({
    where: { id: classId },
    include: { app: true },
  });

  if (!class_) {
    throw new Error(`Class with id ${classId} not found`);
  }

  console.log(`Generating vectors for class: ${class_.name}`);

  // Generate embeddings for name and description
  const nameVector = await generateEmbedding(class_.name);
  const descriptionVector = class_.description
    ? await generateEmbedding(class_.description)
    : null;

  // Generate metadata using LLM
  const metadata = await generateClassMetadata(class_, class_.app);

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter(
    (v) => v && v.trim().length > 0
  );

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: {
    keys: string[];
    values: string[];
    vectors: number[][];
  } = {
    keys: [],
    values: [],
    vectors: [],
  };

  metadataKeys.forEach((key, index) => {
    const value = metadata[key];
    if (value && value.trim().length > 0 && metadataVectors[index]) {
      validMetadata.keys.push(key);
      validMetadata.values.push(value);
      validMetadata.vectors.push(metadataVectors[index]);
    }
  });

  // Store using raw SQL
  const nameVectorStr = vectorToPgVector(nameVector);
  const descriptionVectorStr = descriptionVector
    ? vectorToPgVector(descriptionVector)
    : null;

  const query = `
    INSERT INTO class_data (
      id, "classId", "nameVector", "descriptionVector", 
      "metadataKeys", "metadataValues", "metadataVectors", 
      "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1,
      $2::vector,
      $3::vector,
      $4::text[],
      $5::jsonb,
      $6::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT ("classId") 
    DO UPDATE SET
      "nameVector" = EXCLUDED."nameVector",
      "descriptionVector" = EXCLUDED."descriptionVector",
      "metadataKeys" = EXCLUDED."metadataKeys",
      "metadataValues" = EXCLUDED."metadataValues",
      "metadataVectors" = EXCLUDED."metadataVectors",
      "updatedAt" = NOW()
  `;

  // Format arrays properly for PostgreSQL
  const metadataKeysArray = `{${validMetadata.keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",")}}`;
  const metadataValuesJson = JSON.stringify(validMetadata.values);
  const metadataVectorsJson = JSON.stringify(validMetadata.vectors);

  await prisma.$executeRawUnsafe(
    query,
    classId,
    nameVectorStr,
    descriptionVectorStr,
    metadataKeysArray,
    metadataValuesJson,
    metadataVectorsJson
  );

  console.log(`✓ Completed vectors for class: ${class_.name}`);
}

/**
 * Populate vector data for a Method
 */
export async function populateMethodData(methodId: string): Promise<void> {
  const method = await prisma.method.findUnique({
    where: { id: methodId },
    include: {
      class: {
        include: {
          app: true,
        },
      },
    },
  });

  if (!method) {
    throw new Error(`Method with id ${methodId} not found`);
  }

  console.log(`Generating vectors for method: ${method.name}`);

  // Generate embeddings for name and description
  const nameVector = await generateEmbedding(method.name);
  const descriptionVector = method.description
    ? await generateEmbedding(method.description)
    : null;

  // Generate metadata using LLM
  const metadata = await generateMethodMetadata(
    method,
    method.class,
    method.class.app
  );

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter(
    (v) => v && v.trim().length > 0
  );

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: {
    keys: string[];
    values: string[];
    vectors: number[][];
  } = {
    keys: [],
    values: [],
    vectors: [],
  };

  metadataKeys.forEach((key, index) => {
    const value = metadata[key];
    if (value && value.trim().length > 0 && metadataVectors[index]) {
      validMetadata.keys.push(key);
      validMetadata.values.push(value);
      validMetadata.vectors.push(metadataVectors[index]);
    }
  });

  // Store using raw SQL
  const nameVectorStr = vectorToPgVector(nameVector);
  const descriptionVectorStr = descriptionVector
    ? vectorToPgVector(descriptionVector)
    : null;

  const query = `
    INSERT INTO method_data (
      id, "methodId", "nameVector", "descriptionVector", 
      "metadataKeys", "metadataValues", "metadataVectors", 
      "createdAt", "updatedAt"
    )
    VALUES (
      gen_random_uuid()::text,
      $1,
      $2::vector,
      $3::vector,
      $4::text[],
      $5::jsonb,
      $6::jsonb,
      NOW(),
      NOW()
    )
    ON CONFLICT ("methodId") 
    DO UPDATE SET
      "nameVector" = EXCLUDED."nameVector",
      "descriptionVector" = EXCLUDED."descriptionVector",
      "metadataKeys" = EXCLUDED."metadataKeys",
      "metadataValues" = EXCLUDED."metadataValues",
      "metadataVectors" = EXCLUDED."metadataVectors",
      "updatedAt" = NOW()
  `;

  // Format arrays properly for PostgreSQL
  const metadataKeysArray = `{${validMetadata.keys.map((k) => `"${k.replace(/"/g, '\\"')}"`).join(",")}}`;
  const metadataValuesJson = JSON.stringify(validMetadata.values);
  const metadataVectorsJson = JSON.stringify(validMetadata.vectors);

  await prisma.$executeRawUnsafe(
    query,
    methodId,
    nameVectorStr,
    descriptionVectorStr,
    metadataKeysArray,
    metadataValuesJson,
    metadataVectorsJson
  );

  console.log(`✓ Completed vectors for method: ${method.name}`);
}

/**
 * Populate vectors for all entities (only processes entities without existing vectors)
 * @param totalLimit - Optional total limit on entities to process across all types
 */
export async function populateAllVectors(totalLimit?: number): Promise<void> {
  console.log("Starting vector population for all entities...");
  if (totalLimit) {
    console.log(`Total limit: ${totalLimit} entities`);
  }

  let processedCount = 0;
  let skippedCount = 0;

  // Batch check: Get all apps without vectors using a single query
  const appsWithoutVectors = await prisma.app.findMany({
    where: {
      appData: null,
    },
  });
  const totalApps = await prisma.app.count();

  console.log(
    `Found ${totalApps} apps (${appsWithoutVectors.length} without vectors)`
  );

  for (const app of appsWithoutVectors) {
    if (totalLimit && processedCount >= totalLimit) break;
    try {
      await populateAppData(app.id);
      processedCount++;
    } catch (error) {
      console.error(`Error populating vectors for app ${app.id}:`, error);
    }
  }
  skippedCount += totalApps - appsWithoutVectors.length;

  // Batch check: Get all classes without vectors using a single query
  if (!totalLimit || processedCount < totalLimit) {
    const classesWithoutVectors = await prisma.class.findMany({
      where: {
        classData: null,
      },
    });
    const totalClasses = await prisma.class.count();

    console.log(
      `Found ${totalClasses} classes (${classesWithoutVectors.length} without vectors)`
    );

    for (const class_ of classesWithoutVectors) {
      if (totalLimit && processedCount >= totalLimit) break;
      try {
        await populateClassData(class_.id);
        processedCount++;
      } catch (error) {
        console.error(
          `Error populating vectors for class ${class_.id}:`,
          error
        );
      }
    }
    skippedCount += totalClasses - classesWithoutVectors.length;
  }

  // Batch check: Get all methods without vectors using a single query
  if (!totalLimit || processedCount < totalLimit) {
    const remainingLimit = totalLimit ? totalLimit - processedCount : undefined;

    const methodsWithoutVectors = await prisma.method.findMany({
      where: {
        methodData: null,
      },
      take: remainingLimit,
    });
    const totalMethods = await prisma.method.count();
    const totalMethodsWithoutVectors = await prisma.method.count({
      where: { methodData: null },
    });

    console.log(
      `Found ${totalMethods} methods (${totalMethodsWithoutVectors} without vectors)`
    );

    for (const method of methodsWithoutVectors) {
      try {
        await populateMethodData(method.id);
        processedCount++;
      } catch (error) {
        console.error(
          `Error populating vectors for method ${method.id}:`,
          error
        );
      }
    }
    skippedCount += totalMethods - totalMethodsWithoutVectors;
  }

  console.log("\n" + "=".repeat(60));
  console.log("✓ Completed vector population");
  console.log(`  Processed: ${processedCount} entities`);
  console.log(`  Skipped (already have vectors): ${skippedCount} entities`);
  if (totalLimit && processedCount >= totalLimit) {
    console.log(`  Reached limit of ${totalLimit} entities`);
  }
  console.log("=".repeat(60));
}
