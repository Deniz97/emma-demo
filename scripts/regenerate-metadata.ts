#!/usr/bin/env tsx

/**
 * Script to regenerate metadata for Apps, Classes, and Methods
 * This regenerates metadata without regenerating embeddings for name/description
 * 
 * Usage:
 *   tsx scripts/regenerate-metadata.ts --all
 *   tsx scripts/regenerate-metadata.ts --app-id <id>
 *   tsx scripts/regenerate-metadata.ts --class-id <id>
 *   tsx scripts/regenerate-metadata.ts --method-id <id>
 */

import { config } from "dotenv";
import { prisma } from "../lib/prisma";
import {
  generateAppMetadata,
  generateClassMetadata,
  generateMethodMetadata,
} from "../lib/metadata-service";
import { generateEmbeddings, vectorToPgVector } from "../lib/embedding-service";

// Load environment variables
config();

async function regenerateAppMetadata(appId: string) {
  const app = await prisma.app.findUnique({
    where: { id: appId },
  });

  if (!app) {
    throw new Error(`App with id ${appId} not found`);
  }

  console.log(`Regenerating metadata for app: ${app.name}`);

  // Generate metadata using LLM
  const metadata = await generateAppMetadata(app);

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter((v) => v && v.trim().length > 0);

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: { keys: string[]; values: string[]; vectors: number[][] } = {
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

  // Update only metadata fields
  await prisma.$executeRawUnsafe(
    `
    UPDATE app_data
    SET
      "metadataKeys" = $1::text[],
      "metadataValues" = $2::jsonb,
      "metadataVectors" = $3::jsonb,
      "updatedAt" = NOW()
    WHERE "appId" = $4
    `,
    JSON.stringify(validMetadata.keys),
    JSON.stringify(validMetadata.values),
    JSON.stringify(validMetadata.vectors),
    appId
  );

  console.log(`✓ Completed metadata regeneration for app: ${app.name}`);
}

async function regenerateClassMetadata(classId: string) {
  const class_ = await prisma.class.findUnique({
    where: { id: classId },
    include: { app: true },
  });

  if (!class_) {
    throw new Error(`Class with id ${classId} not found`);
  }

  console.log(`Regenerating metadata for class: ${class_.name}`);

  // Generate metadata using LLM
  const metadata = await generateClassMetadata(class_, class_.app);

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter((v) => v && v.trim().length > 0);

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: { keys: string[]; values: string[]; vectors: number[][] } = {
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

  // Update only metadata fields
  await prisma.$executeRawUnsafe(
    `
    UPDATE class_data
    SET
      "metadataKeys" = $1::text[],
      "metadataValues" = $2::jsonb,
      "metadataVectors" = $3::jsonb,
      "updatedAt" = NOW()
    WHERE "classId" = $4
    `,
    JSON.stringify(validMetadata.keys),
    JSON.stringify(validMetadata.values),
    JSON.stringify(validMetadata.vectors),
    classId
  );

  console.log(`✓ Completed metadata regeneration for class: ${class_.name}`);
}

async function regenerateMethodMetadata(methodId: string) {
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

  console.log(`Regenerating metadata for method: ${method.name}`);

  // Generate metadata using LLM
  const metadata = await generateMethodMetadata(method, method.class, method.class.app);

  // Extract keys and values
  const metadataKeys = Object.keys(metadata);
  const metadataValues = Object.values(metadata).filter((v) => v && v.trim().length > 0);

  // Generate embeddings for metadata values
  const metadataVectors = await generateEmbeddings(metadataValues);

  // Filter out empty metadata entries
  const validMetadata: { keys: string[]; values: string[]; vectors: number[][] } = {
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

  // Update only metadata fields
  await prisma.$executeRawUnsafe(
    `
    UPDATE method_data
    SET
      "metadataKeys" = $1::text[],
      "metadataValues" = $2::jsonb,
      "metadataVectors" = $3::jsonb,
      "updatedAt" = NOW()
    WHERE "methodId" = $4
    `,
    JSON.stringify(validMetadata.keys),
    JSON.stringify(validMetadata.values),
    JSON.stringify(validMetadata.vectors),
    methodId
  );

  console.log(`✓ Completed metadata regeneration for method: ${method.name}`);
}

async function regenerateAllMetadata() {
  console.log("Starting metadata regeneration for all entities...");

  // Get all apps with vector data
  const apps = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM apps WHERE id IN (SELECT "appId" FROM app_data)
  `;

  console.log(`Found ${apps.length} apps with vector data`);

  for (const app of apps) {
    try {
      await regenerateAppMetadata(app.id);
    } catch (error) {
      console.error(`Error regenerating metadata for app ${app.id}:`, error);
    }
  }

  // Get all classes with vector data
  const classes = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM classes WHERE id IN (SELECT "classId" FROM class_data)
  `;

  console.log(`Found ${classes.length} classes with vector data`);

  for (const class_ of classes) {
    try {
      await regenerateClassMetadata(class_.id);
    } catch (error) {
      console.error(`Error regenerating metadata for class ${class_.id}:`, error);
    }
  }

  // Get all methods with vector data
  const methods = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM methods WHERE id IN (SELECT "methodId" FROM method_data)
  `;

  console.log(`Found ${methods.length} methods with vector data`);

  for (const method of methods) {
    try {
      await regenerateMethodMetadata(method.id);
    } catch (error) {
      console.error(`Error regenerating metadata for method ${method.id}:`, error);
    }
  }

  console.log("✓ Completed metadata regeneration for all entities");
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--all")) {
    await regenerateAllMetadata();
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--app-id")) {
    const index = args.indexOf("--app-id");
    const appId = args[index + 1];
    if (!appId) {
      console.error("Error: --app-id requires an app ID");
      process.exit(1);
    }
    await regenerateAppMetadata(appId);
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--class-id")) {
    const index = args.indexOf("--class-id");
    const classId = args[index + 1];
    if (!classId) {
      console.error("Error: --class-id requires a class ID");
      process.exit(1);
    }
    await regenerateClassMetadata(classId);
    console.log("✓ Done!");
    process.exit(0);
  }

  if (args.includes("--method-id")) {
    const index = args.indexOf("--method-id");
    const methodId = args[index + 1];
    if (!methodId) {
      console.error("Error: --method-id requires a method ID");
      process.exit(1);
    }
    await regenerateMethodMetadata(methodId);
    console.log("✓ Done!");
    process.exit(0);
  }

  console.log(`
Usage:
  tsx scripts/regenerate-metadata.ts --all
  tsx scripts/regenerate-metadata.ts --app-id <id>
  tsx scripts/regenerate-metadata.ts --class-id <id>
  tsx scripts/regenerate-metadata.ts --method-id <id>
  `);
  process.exit(1);
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});

