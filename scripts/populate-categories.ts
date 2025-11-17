// Load environment variables from .env file FIRST, before any other imports
import { config } from "dotenv";
config();

import { readFileSync } from "fs";
import { join } from "path";
import { prisma } from "../lib/prisma";
import { slugify } from "../lib/slug";

/**
 * Parse mock_apps.txt to extract app information grouped by category
 */
function parseMockAppsByCategory(filePath: string): Map<string, string[]> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const appsByCategory = new Map<string, string[]>();
  let currentCategory = "";
  let currentApp: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check for category header (starts with ✅)
    if (line.startsWith("✅")) {
      const categoryMatch = line.match(/✅\s*\d+\.\s*(.+)/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
      }
      continue;
    }

    // Skip empty lines
    if (!line || line.length === 0) {
      continue;
    }

    // Skip category description lines
    if (!line.match(/^\d+\)/) && !line.startsWith("✅") && currentApp === null && currentCategory) {
      continue;
    }

    // Check for app entry (number followed by closing parenthesis)
    const appMatch = line.match(/^\d+\)\s*(.+)/);
    if (appMatch) {
      // Save previous app if exists
      if (currentApp && currentCategory) {
        if (!appsByCategory.has(currentCategory)) {
          appsByCategory.set(currentCategory, []);
        }
        appsByCategory.get(currentCategory)!.push(currentApp);
      }
      // Start new app
      currentApp = appMatch[1].trim();
      continue;
    }

    // Description line - we don't need it for this script
  }

  // Don't forget the last app
  if (currentApp && currentCategory) {
    if (!appsByCategory.has(currentCategory)) {
      appsByCategory.set(currentCategory, []);
    }
    appsByCategory.get(currentCategory)!.push(currentApp);
  }

  return appsByCategory;
}

/**
 * Upsert a category (create only if missing)
 */
async function upsertCategory(categoryName: string) {
  const slug = slugify(categoryName);
  const category = await prisma.category.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      name: categoryName,
    },
  });
  return category;
}

/**
 * Main function to populate categories
 */
async function main() {
  console.log("Starting category population...");

  // Parse mock_apps.txt
  const filePath = join(process.cwd(), "mock_apps.txt");
  const appsByCategory = parseMockAppsByCategory(filePath);
  console.log(`Parsed ${appsByCategory.size} categories from mock_apps.txt`);

  // Create all categories
  console.log("\nCreating categories...");
  const categoryMap = new Map<string, string>(); // category name -> category id
  for (const [categoryName, apps] of appsByCategory) {
    const category = await upsertCategory(categoryName);
    categoryMap.set(categoryName, category.id);
    console.log(`  Created/updated category: ${category.name} (${category.slug}) - ${apps.length} apps`);
  }

  // Update all apps with their categories
  console.log("\nUpdating apps with categories...");
  let updatedCount = 0;
  let notFoundCount = 0;

  for (const [categoryName, appNames] of appsByCategory) {
    const categoryId = categoryMap.get(categoryName);
    if (!categoryId) continue;

    for (const appName of appNames) {
      const appSlug = slugify(appName);
      const app = await prisma.app.findUnique({
        where: { slug: appSlug },
      });

      if (app) {
        await prisma.app.update({
          where: { id: app.id },
          data: { categoryId },
        });
        updatedCount++;
        console.log(`  Updated: ${appName} -> ${categoryName}`);
      } else {
        notFoundCount++;
        console.log(`  Not found: ${appName} (slug: ${appSlug})`);
      }
    }
  }

  console.log(`\n✅ Category population completed!`);
  console.log(`   Updated: ${updatedCount} apps`);
  if (notFoundCount > 0) {
    console.log(`   Not found: ${notFoundCount} apps`);
  }
}

// Run the script
main()
  .catch((error) => {
    console.error("Category population failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

