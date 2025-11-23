#!/usr/bin/env tsx
/**
 * Test the vector search flow step by step
 */

import dotenv from "dotenv";
dotenv.config();

import { get_apps } from "../lib/meta-tools/get-apps";
import { get_classes } from "../lib/meta-tools/get-classes";
import { get_methods } from "../lib/meta-tools/get-methods";

async function testFlow() {
  console.log("🔍 Testing vector search flow...\n");

  // Step 1: Get apps
  console.log("Step 1: Getting apps...");
  const apps = await get_apps({
    search_queries: ["cryptocurrency", "bitcoin"],
    top: 5,
    threshold: 0.3,
  });
  console.log(`Found ${apps.length} apps:`);
  apps.forEach((app) => {
    console.log(`  - ${app.slug}: ${app.name}`);
  });

  if (apps.length === 0) {
    console.log("\n❌ No apps found!");
    return;
  }

  // Step 2: Get classes (without app filter first)
  console.log("\nStep 2a: Getting classes (NO app filter)...");
  const classesNoFilter = await get_classes({
    search_queries: ["price", "bitcoin"],
    top: 5,
    threshold: 0.3,
  });
  console.log(`Found ${classesNoFilter.length} classes:`);
  classesNoFilter.forEach((cls) => {
    console.log(`  - ${cls.appSlug}.${cls.slug}: ${cls.name}`);
  });

  // Step 2b: Get classes (WITH app filter)
  console.log("\nStep 2b: Getting classes (WITH app filter)...");
  const appSlugs = apps.map((a) => a.slug);
  console.log(`Filtering by apps: ${appSlugs.join(", ")}`);
  const classesWithFilter = await get_classes({
    apps: appSlugs,
    search_queries: ["price", "bitcoin"],
    top: 5,
    threshold: 0.3,
  });
  console.log(`Found ${classesWithFilter.length} classes:`);
  classesWithFilter.forEach((cls) => {
    console.log(`  - ${cls.appSlug}.${cls.slug}: ${cls.name}`);
  });

  if (classesWithFilter.length === 0) {
    console.log("\n❌ No classes found with app filter!");
    return;
  }

  // Step 3: Get methods
  console.log("\nStep 3: Getting methods...");
  const classSlugs = classesWithFilter.map((c) => c.slug);
  const methods = await get_methods({
    apps: appSlugs,
    classes: classSlugs,
    search_queries: ["current price", "bitcoin"],
    top: 10,
    threshold: 0.3,
  });
  console.log(`Found ${methods.length} methods:`);
  methods.forEach((method) => {
    console.log(`  - ${method.appSlug}.${method.classSlug}.${method.slug}`);
    console.log(`    Name: ${method.name}`);
  });
}

testFlow().catch(console.error);
