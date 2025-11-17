#!/usr/bin/env tsx
/**
 * Test script to check actual similarity scores
 */

import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../lib/prisma";
import { generateEmbedding, vectorToPgVector } from "../lib/embedding-service";

async function testSimilarity() {
  console.log("🔍 Testing vector similarity scores...\n");

  // Generate embedding for test query
  const testQuery = "bitcoin price";
  console.log(`Query: "${testQuery}"`);
  const queryEmbedding = await generateEmbedding(testQuery);
  const vectorStr = vectorToPgVector(queryEmbedding);

  // Search methods with NO threshold to see all scores
  const sql = `
    SELECT 
      m.slug,
      m.name,
      m.description,
      a.slug as "appSlug",
      1 - (md."nameVector" <=> $1::vector) as "nameSimilarity",
      CASE 
        WHEN md."descriptionVector" IS NOT NULL 
        THEN 1 - (md."descriptionVector" <=> $1::vector)
        ELSE NULL
      END as "descSimilarity",
      GREATEST(
        1 - (md."nameVector" <=> $1::vector),
        COALESCE(1 - (md."descriptionVector" <=> $1::vector), 0)
      ) as "bestSimilarity"
    FROM methods m
    INNER JOIN method_data md ON m.id = md."methodId"
    INNER JOIN classes c ON m."classId" = c.id
    INNER JOIN apps a ON c."appId" = a.id
    ORDER BY "bestSimilarity" DESC
    LIMIT 20
  `;

  const results = await prisma.$queryRawUnsafe<any[]>(sql, vectorStr);

  console.log(`\nTop 20 methods by similarity:`);
  console.log("─".repeat(100));
  results.forEach((r, i) => {
    console.log(`${i + 1}. [${r.bestSimilarity.toFixed(4)}] ${r.appSlug}.${r.slug}`);
    console.log(`   Name: ${r.name}`);
    console.log(`   Name similarity: ${r.nameSimilarity?.toFixed(4)}`);
    console.log(`   Desc similarity: ${r.descSimilarity?.toFixed(4) || "N/A"}`);
    console.log(`   Description: ${r.description?.substring(0, 80)}...`);
    console.log();
  });

  const above05 = results.filter(r => r.bestSimilarity > 0.5).length;
  const above04 = results.filter(r => r.bestSimilarity > 0.4).length;
  const above03 = results.filter(r => r.bestSimilarity > 0.3).length;

  console.log("─".repeat(100));
  console.log(`\nSimilarity distribution:`);
  console.log(`  > 0.5: ${above05} methods`);
  console.log(`  > 0.4: ${above04} methods`);
  console.log(`  > 0.3: ${above03} methods`);

  await prisma.$disconnect();
}

testSimilarity().catch(console.error);

