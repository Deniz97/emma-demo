// Load environment variables from .env file FIRST, before any other imports
import { config } from "dotenv";
config();

import { readFileSync } from "fs";
import { join } from "path";
import OpenAI from "openai";
import { prisma } from "../lib/prisma";
import { slugify } from "../lib/slug";
import { parseJsonResponse } from "../lib/llm-utils";
import { delay } from "../lib/utils";

// Create OpenAI client after env is loaded
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-placeholder",
});

// Types
type AppData = {
  name: string;
  description: string;
  category: string;
};

type ClassData = {
  name: string;
  description: string;
};

type MethodData = {
  name: string;
  path: string;
  httpVerb: string;
  description: string;
  arguments: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  returnType: string;
  returnDescription: string;
};

/**
 * Parse mock_apps.txt to extract app information grouped by category
 */
function parseMockAppsByCategory(filePath: string): Map<string, AppData[]> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const appsByCategory = new Map<string, AppData[]>();
  let currentCategory = "";
  let currentApp: Partial<AppData> | null = null;

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

    // Skip category description lines (they don't start with numbers or ✅)
    // These are lines like "These give broad market overviews." that come after category headers
    if (!line.match(/^\d+\)/) && !line.startsWith("✅") && currentApp === null && currentCategory) {
      // This is likely a category description, skip it
      continue;
    }

    // Check for app entry (number followed by closing parenthesis)
    const appMatch = line.match(/^\d+\)\s*(.+)/);
    if (appMatch) {
      // Save previous app if exists
      if (currentApp && currentApp.name && currentCategory) {
        const app: AppData = {
          name: currentApp.name,
          description: currentApp.description || "",
          category: currentCategory,
        };
        if (!appsByCategory.has(currentCategory)) {
          appsByCategory.set(currentCategory, []);
        }
        appsByCategory.get(currentCategory)!.push(app);
      }
      // Start new app
      currentApp = {
        name: appMatch[1].trim(),
        category: currentCategory,
      };
      continue;
    }

    // If we have a current app and this line is not empty and not a category header, it's the description
    if (currentApp && line.length > 0 && !line.startsWith("✅") && !line.match(/^\d+\)/)) {
      currentApp.description = line;
    }
  }

  // Don't forget the last app
  if (currentApp && currentApp.name && currentCategory) {
    const app: AppData = {
      name: currentApp.name,
      description: currentApp.description || "",
      category: currentCategory,
    };
    if (!appsByCategory.has(currentCategory)) {
      appsByCategory.set(currentCategory, []);
    }
    appsByCategory.get(currentCategory)!.push(app);
  }

  return appsByCategory;
}

/**
 * Select apps in round-robin fashion across categories
 * Continues cycling through categories until limit is reached or all apps are exhausted
 */
function selectAppsRoundRobin(appsByCategory: Map<string, AppData[]>, limit?: number): AppData[] {
  const selectedApps: AppData[] = [];
  const categories = Array.from(appsByCategory.keys());
  
  if (categories.length === 0) {
    return selectedApps;
  }
  
  // Keep track of current index for each category
  const categoryIndexes = new Map<string, number>();
  for (const category of categories) {
    categoryIndexes.set(category, 0);
  }
  
  // Round-robin through categories
  let categoryIdx = 0;
  let totalAppsRemaining = Array.from(appsByCategory.values()).reduce((sum, apps) => sum + apps.length, 0);
  
  while (totalAppsRemaining > 0 && (!limit || selectedApps.length < limit)) {
    const category = categories[categoryIdx];
    const apps = appsByCategory.get(category) || [];
    const currentIndex = categoryIndexes.get(category) || 0;
    
    // If this category still has apps to select
    if (currentIndex < apps.length) {
      selectedApps.push(apps[currentIndex]);
      categoryIndexes.set(category, currentIndex + 1);
      totalAppsRemaining--;
    }
    
    // Move to next category
    categoryIdx = (categoryIdx + 1) % categories.length;
  }
  
  return selectedApps;
}


/**
 * Generate classes for an app using LLM
 */
async function generateClassesForApp(appData: AppData): Promise<ClassData[]> {
  const prompt = `You are generating API class definitions for a crypto tool system.

App: ${appData.name}
Description: ${appData.description}
Domain: ${appData.category}

Generate 3-5 relevant API classes that would exist in this app's API.
Each class should represent a logical grouping of related API endpoints.

Return a JSON array with this structure:
[
  {
    "name": "ClassName",
    "description": "Brief description of what this class handles"
  }
]

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON array.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates API class definitions. You MUST return ONLY valid JSON arrays with no markdown formatting, no code blocks, and no explanations. Just the raw JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse JSON with improved error handling
    const parsed = parseJsonResponse(content);
    
    // Handle different response formats
    let classes: ClassData[];
    if (Array.isArray(parsed)) {
      classes = parsed;
    } else if (parsed && typeof parsed === "object" && parsed !== null) {
      const parsedObj = parsed as Record<string, unknown>;
      // If it's an object, try to find an array property
      if (parsedObj.classes && Array.isArray(parsedObj.classes)) {
        classes = parsedObj.classes as ClassData[];
      } else if (parsedObj.data && Array.isArray(parsedObj.data)) {
        classes = parsedObj.data as ClassData[];
      } else {
        // Try to find any array in the object
        const arrayValue = Object.values(parsedObj).find((v) => Array.isArray(v));
        if (arrayValue) {
          classes = arrayValue as ClassData[];
        } else {
          throw new Error("LLM response does not contain a valid array");
        }
      }
    } else {
      throw new Error("LLM response is not a valid JSON array or object");
    }

    if (!Array.isArray(classes) || classes.length === 0) {
      throw new Error("LLM response is not a valid non-empty array");
    }

    // Validate structure
    for (const cls of classes) {
      if (!cls.name || typeof cls.name !== "string") {
        throw new Error(`Invalid class structure: missing or invalid 'name' field`);
      }
    }

    return classes;
  } catch (error) {
    throw new Error(`Failed to generate classes for ${appData.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate methods for a class using LLM
 */
async function generateMethodsForClass(
  appData: AppData,
  classData: ClassData
): Promise<MethodData[]> {
  const prompt = `You are generating API method definitions for a crypto tool system.

App: ${appData.name}
Class: ${classData.name}
Class Description: ${classData.description}

Generate 5-8 relevant API methods for this class.
Each method should have:
- A meaningful name
- An HTTP verb (GET, POST, PUT, DELETE, PATCH)
- A RESTful path
- Typed arguments with descriptions
- Return type information

Return a JSON array with this structure:
[
  {
    "name": "methodName",
    "path": "/v1/endpoint",
    "httpVerb": "GET",
    "description": "What this method does",
    "arguments": [
      {
        "name": "paramName",
        "type": "string",
        "description": "Parameter description"
      }
    ],
    "returnType": "PriceData",
    "returnDescription": "Returns price information"
  }
]

IMPORTANT: Return ONLY valid JSON. No markdown, no code blocks, no explanations. Just the JSON array.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5-nano-2025-08-07",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that generates API method definitions. You MUST return ONLY valid JSON arrays with no markdown formatting, no code blocks, and no explanations. Just the raw JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    // Parse JSON with improved error handling
    const parsed = parseJsonResponse(content);
    
    // Handle different response formats
    let methods: MethodData[];
    if (Array.isArray(parsed)) {
      methods = parsed;
    } else if (parsed && typeof parsed === "object" && parsed !== null) {
      const parsedObj = parsed as Record<string, unknown>;
      // If it's an object, try to find an array property
      if (parsedObj.methods && Array.isArray(parsedObj.methods)) {
        methods = parsedObj.methods as MethodData[];
      } else if (parsedObj.data && Array.isArray(parsedObj.data)) {
        methods = parsedObj.data as MethodData[];
      } else {
        // Try to find any array in the object
        const arrayValue = Object.values(parsedObj).find((v) => Array.isArray(v));
        if (arrayValue) {
          methods = arrayValue as MethodData[];
        } else {
          throw new Error("LLM response does not contain a valid array");
        }
      }
    } else {
      throw new Error("LLM response is not a valid JSON array or object");
    }

    if (!Array.isArray(methods) || methods.length === 0) {
      throw new Error("LLM response is not a valid non-empty array");
    }

    // Validate structure
    for (const method of methods) {
      if (!method.name || typeof method.name !== "string") {
        throw new Error(`Invalid method structure: missing or invalid 'name' field`);
      }
      if (!method.path || typeof method.path !== "string") {
        throw new Error(`Invalid method structure: missing or invalid 'path' field`);
      }
      if (!method.httpVerb || typeof method.httpVerb !== "string") {
        throw new Error(`Invalid method structure: missing or invalid 'httpVerb' field`);
      }
      if (!Array.isArray(method.arguments)) {
        throw new Error(`Invalid method structure: 'arguments' must be an array`);
      }
    }

    return methods;
  } catch (error) {
    throw new Error(`Failed to generate methods for ${classData.name} in ${appData.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
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
 * Upsert an app (create only if missing)
 */
async function upsertApp(appData: AppData, categoryId: string | null) {
  const slug = slugify(appData.name);
  const app = await prisma.app.upsert({
    where: { slug },
    update: {
      categoryId: categoryId || undefined,
    },
    create: {
      slug,
      name: appData.name,
      description: appData.description,
      categoryId: categoryId || undefined,
    },
  });
  return app;
}

/**
 * Upsert a class (create only if missing)
 */
async function upsertClass(appId: string, appSlug: string, classData: ClassData) {
  // Make slug unique by prefixing with app slug
  const slug = `${appSlug}-${slugify(classData.name)}`;
  const dbClass = await prisma.class.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      appId,
      name: classData.name,
      description: classData.description,
    },
  });
  return dbClass;
}

/**
 * Upsert a method (create only if missing)
 */
async function upsertMethod(classId: string, classSlug: string, methodData: MethodData) {
  // Make slug unique by prefixing with class slug
  const slug = `${classSlug}-${slugify(methodData.name)}`;
  await prisma.method.upsert({
    where: { slug },
    update: {},
    create: {
      slug,
      classId,
      name: methodData.name,
      path: methodData.path,
      httpVerb: methodData.httpVerb,
      description: methodData.description,
      arguments: methodData.arguments,
      returnType: methodData.returnType,
      returnDescription: methodData.returnDescription,
    },
  });
}

/**
 * Get classes for an app
 */
async function getClassesForApp(appId: string) {
  return await prisma.class.findMany({
    where: { appId },
  });
}

/**
 * Get methods for a class
 */
async function getMethodsForClass(classId: string) {
  return await prisma.method.findMany({
    where: { classId },
  });
}


/**
 * Parse limit from command line arguments or environment variable
 */
function getAppLimit(): number | undefined {
  // Check command line arguments (--limit=N or --limit N)
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  if (limitArg) {
    const limit = parseInt(limitArg.split("=")[1], 10);
    if (!isNaN(limit) && limit > 0) {
      return limit;
    }
  }

  // Check for --limit followed by number
  const limitIndex = process.argv.indexOf("--limit");
  if (limitIndex !== -1 && limitIndex + 1 < process.argv.length) {
    const limit = parseInt(process.argv[limitIndex + 1], 10);
    if (!isNaN(limit) && limit > 0) {
      return limit;
    }
  }

  // Check environment variable
  if (process.env.SEED_APP_LIMIT) {
    const limit = parseInt(process.env.SEED_APP_LIMIT, 10);
    if (!isNaN(limit) && limit > 0) {
      return limit;
    }
  }

  return undefined;
}

/**
 * Main seed function
 */
async function main() {
  const appLimit = getAppLimit();
  
  // Parse mock_apps.txt and select apps in round-robin fashion across categories
  const filePath = join(process.cwd(), "mock_apps.txt");
  const appsByCategory = parseMockAppsByCategory(filePath);
  const apps = selectAppsRoundRobin(appsByCategory, appLimit);
  
  console.log(`Parsed apps from ${appsByCategory.size} categories`);
  if (appLimit) {
    console.log(`Selected ${apps.length} apps (round-robin, limited to ${appLimit})`);
    console.log(`Starting seed process with app limit: ${appLimit} apps`);
  } else {
    console.log(`Selected ${apps.length} apps (round-robin, no limit)`);
    console.log("Starting seed process (no app limit)...");
  }

  // First, create all categories
  console.log("\nCreating categories...");
  const categoryMap = new Map<string, string>(); // category name -> category id
  const uniqueCategories = new Set<string>();
  for (const app of apps) {
    if (app.category) {
      uniqueCategories.add(app.category);
    }
  }
  
  for (const categoryName of uniqueCategories) {
    const category = await upsertCategory(categoryName);
    categoryMap.set(categoryName, category.id);
    console.log(`  Created/updated category: ${category.name} (${category.slug})`);
  }

  let totalApps = 0;
  let totalClasses = 0;
  let totalMethods = 0;

  // Process each app
  for (let i = 0; i < apps.length; i++) {
    const appData = apps[i];
    console.log(`\nProcessing app ${i + 1}/${apps.length}: ${appData.name}`);

    try {
      // Get category ID for this app
      const categoryId = appData.category ? categoryMap.get(appData.category) || null : null;
      
      // Upsert app (create only if missing)
      const app = await upsertApp(appData, categoryId);
      totalApps++;

      // Check if app already has classes
      const existingClasses = await getClassesForApp(app.id);
      let classesToProcess: Array<{ data: ClassData; dbClass: any }> = [];

      if (existingClasses.length > 0) {
        console.log(`  App has ${existingClasses.length} existing classes`);
        // Use existing classes
        classesToProcess = existingClasses.map(dbClass => ({
          data: {
            name: dbClass.name,
            description: dbClass.description || "",
          },
          dbClass,
        }));
      } else {
        // Generate new classes via LLM
        console.log(`  Generating classes for ${appData.name}...`);
        const classes = await generateClassesForApp(appData);
        console.log(`  Generated ${classes.length} classes`);

        // Add delay between LLM calls
        await delay(1500);

        // Create classes in database
        const appSlug = slugify(appData.name);
        for (const classData of classes) {
          const dbClass = await upsertClass(app.id, appSlug, classData);
          totalClasses++;
          classesToProcess.push({ data: classData, dbClass });
        }
      }

      // Process each class - check and fill methods
      const MIN_METHODS = 5; // Minimum number of methods per class
      for (const { data: classData, dbClass } of classesToProcess) {
        // Check existing methods
        const existingMethods = await getMethodsForClass(dbClass.id);
        
        if (existingMethods.length >= MIN_METHODS) {
          console.log(`    Class "${classData.name}" has ${existingMethods.length} methods (sufficient)`);
          continue;
        }

        // Generate methods via LLM
        console.log(`    Class "${classData.name}" has ${existingMethods.length} methods (need at least ${MIN_METHODS})`);
        console.log(`    Generating methods for ${classData.name}...`);
        const methods = await generateMethodsForClass(appData, classData);
        console.log(`    Generated ${methods.length} methods`);

        // Add delay between LLM calls
        await delay(1500);

        // Upsert methods (create only if missing)
        const classSlug = dbClass.slug;
        for (const methodData of methods) {
          await upsertMethod(dbClass.id, classSlug, methodData);
          totalMethods++;
        }
      }
    } catch (error) {
      console.error(`\nError processing ${appData.name}:`, error);
      throw error; // Stop on first error
    }
  }

  console.log(`\n✅ Seed completed successfully!`);
  console.log(`   Created/updated: ${totalApps} apps, ${totalClasses} classes, ${totalMethods} methods`);
}

// Run the seed
main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

