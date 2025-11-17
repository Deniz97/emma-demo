#!/usr/bin/env tsx
/**
 * Quick script to check what's in the database
 */

import dotenv from "dotenv";
dotenv.config();

import { prisma } from "../lib/prisma";

async function checkDb() {
  console.log("📊 Checking database contents...\n");

  const apps = await prisma.app.count();
  const classes = await prisma.class.count();
  const methods = await prisma.method.count();
  
  const appData = await prisma.appData.count();
  const classData = await prisma.classData.count();
  const methodData = await prisma.methodData.count();

  console.log("📦 Core entities:");
  console.log(`  Apps: ${apps}`);
  console.log(`  Classes: ${classes}`);
  console.log(`  Methods: ${methods}`);
  
  console.log("\n🔍 Vector data:");
  console.log(`  AppData (with embeddings): ${appData}`);
  console.log(`  ClassData (with embeddings): ${classData}`);
  console.log(`  MethodData (with embeddings): ${methodData}`);

  if (methods > 0) {
    const sampleMethods = await prisma.method.findMany({
      take: 3,
      include: { class: { include: { app: true } } },
    });
    
    console.log("\n📝 Sample methods:");
    sampleMethods.forEach((m) => {
      const slug = `${m.class.app.slug}.${m.class.slug}.${m.slug}`;
      console.log(`  - ${slug}`);
      console.log(`    Name: ${m.name}`);
      console.log(`    Description: ${m.description?.substring(0, 60)}...`);
    });
  }

  await prisma.$disconnect();
}

checkDb().catch(console.error);

