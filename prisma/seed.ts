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
import { getModel } from "../lib/model-config";

// Create OpenAI client after env is loaded
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-placeholder",
});

// Types
type AppData = {
  name: string;
  description: string;
  category: string;
  classes?: ClassData[];  // Optional predefined classes
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
 * Format:
 * ✅ 1. Category Name
 * 
 * **AppName**
 * App description
 * - ClassName: Class description
 * - ClassName: Class description
 */
function parseMockAppsByCategory(filePath: string): Map<string, AppData[]> {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const appsByCategory = new Map<string, AppData[]>();
  let currentCategory = "";
  let currentApp: Partial<AppData> & { classes?: ClassData[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and separator lines
    if (!line || line === "---") {
      continue;
    }

    // Check for category header (starts with ✅)
    if (line.startsWith("✅")) {
      const categoryMatch = line.match(/✅\s*\d+\.\s*(.+)/);
      if (categoryMatch) {
        currentCategory = categoryMatch[1].trim();
      }
      continue;
    }

    // Check for app name (bold text in markdown: **AppName**)
    const appMatch = line.match(/^\*\*(.+?)\*\*$/);
    if (appMatch) {
      // Save previous app if exists
      if (currentApp && currentApp.name && currentCategory) {
        const app: AppData = {
          name: currentApp.name,
          description: currentApp.description || "",
          category: currentCategory,
          classes: currentApp.classes || undefined,
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
        description: "",
        classes: [],
      };
      continue;
    }

    // If we have a current app and line doesn't start with "-", it's the app description
    if (currentApp && !line.startsWith("-") && currentCategory) {
      currentApp.description = line;
      continue;
    }

    // Lines starting with "-" are class definitions: "- ClassName: Description"
    if (currentApp && line.startsWith("-")) {
      const classMatch = line.match(/^-\s*(.+?):\s*(.+)$/);
      if (classMatch) {
        const className = classMatch[1].trim();
        const classDescription = classMatch[2].trim();
        if (!currentApp.classes) {
          currentApp.classes = [];
        }
        currentApp.classes.push({
          name: className,
          description: classDescription,
        });
      }
    }
  }

  // Don't forget the last app
  if (currentApp && currentApp.name && currentCategory) {
    const app: AppData = {
      name: currentApp.name,
      description: currentApp.description || "",
      category: currentCategory,
      classes: currentApp.classes || undefined,
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
      model: getModel("utility"),
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
      response_format: { type: "json_object" },
      temperature: 0.7,
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
 * Generate domain-specific fallback methods
 */
function generateFallbackMethods(
  className: string,
  count: number
): MethodData[] {
  // Domain-specific fallback methods based on real crypto API patterns
  const methodsByDomain: Record<string, MethodData[]> = {
    // CoinGecko-style patterns
    GlobalMetrics: [
      {
        name: "getTotalMarketCap",
        httpVerb: "GET",
        path: "/api/v1/global/market_cap",
        description: "Get total cryptocurrency market capitalization",
        arguments: [
          { name: "currency", type: "string", description: "usd, eur, btc" },
        ],
        returnType: "object",
        returnDescription: "Market cap data by currency",
      },
      {
        name: "getMarketDominance",
        httpVerb: "GET",
        path: "/api/v1/global/dominance",
        description: "Get market dominance by coin",
        arguments: [],
        returnType: "object",
        returnDescription: "Dominance percentages",
      },
    ],
    TrendingCoins: [
      {
        name: "getTrendingCoins",
        httpVerb: "GET",
        path: "/api/v1/search/trending",
        description: "Get trending coins",
        arguments: [
          { name: "limit", type: "number", description: "Results limit" },
        ],
        returnType: "array",
        returnDescription: "List of trending coins",
      },
      {
        name: "getMostSearched",
        httpVerb: "GET",
        path: "/api/v1/search/most-searched",
        description: "Most searched in 24h",
        arguments: [],
        returnType: "array",
        returnDescription: "Most searched coins",
      },
    ],
    // DeFiLlama-style patterns
    TVLStatistics: [
      {
        name: "getProtocolTVL",
        httpVerb: "GET",
        path: "/api/v1/tvl/{protocol}",
        description: "Current TVL for protocol",
        arguments: [
          { name: "protocol", type: "string", description: "Protocol slug" },
        ],
        returnType: "number",
        returnDescription: "TVL in USD",
      },
      {
        name: "getTVLHistory",
        httpVerb: "GET",
        path: "/api/v1/tvl/{protocol}/history",
        description: "Historical TVL data",
        arguments: [
          { name: "protocol", type: "string", description: "Protocol slug" },
        ],
        returnType: "array",
        returnDescription: "Historical TVL data points",
      },
    ],
    YieldFarming: [
      {
        name: "getPoolAPY",
        httpVerb: "GET",
        path: "/api/v1/yields/pool/{id}/apy",
        description: "Get pool APY",
        arguments: [{ name: "poolId", type: "string", description: "Pool ID" }],
        returnType: "number",
        returnDescription: "APY percentage",
      },
      {
        name: "findBestYields",
        httpVerb: "GET",
        path: "/api/v1/yields/best",
        description: "Find highest yields",
        arguments: [
          { name: "minTVL", type: "number", description: "Min TVL filter" },
        ],
        returnType: "array",
        returnDescription: "Sorted yield opportunities",
      },
    ],
    // Nansen-style patterns
    SmartMoneyInsights: [
      {
        name: "trackSmartMoney",
        httpVerb: "GET",
        path: "/api/v1/wallets/smart-money",
        description: "Get smart money wallets",
        arguments: [
          { name: "minBalance", type: "number", description: "Min balance USD" },
        ],
        returnType: "array",
        returnDescription: "Smart money wallet addresses",
      },
      {
        name: "findWhaleTransfers",
        httpVerb: "GET",
        path: "/api/v1/transfers/whales",
        description: "Find whale transfers",
        arguments: [
          { name: "minAmount", type: "number", description: "Min transfer USD" },
        ],
        returnType: "array",
        returnDescription: "Large transfers",
      },
    ],
    // Derivatives patterns
    OpenInterestTracking: [
      {
        name: "getTotalOpenInterest",
        httpVerb: "GET",
        path: "/api/v1/derivatives/oi/total",
        description: "Total OI across exchanges",
        arguments: [
          { name: "symbol", type: "string", description: "Trading pair" },
        ],
        returnType: "number",
        returnDescription: "Total open interest in USD",
      },
      {
        name: "getOIByExchange",
        httpVerb: "GET",
        path: "/api/v1/derivatives/oi/exchanges",
        description: "OI by exchange",
        arguments: [
          { name: "symbol", type: "string", description: "Trading pair" },
        ],
        returnType: "array",
        returnDescription: "OI breakdown by exchange",
      },
    ],
    FundingRateAnalysis: [
      {
        name: "getCurrentFundingRate",
        httpVerb: "GET",
        path: "/api/v1/derivatives/funding/{symbol}",
        description: "Current funding rate",
        arguments: [
          { name: "symbol", type: "string", description: "Trading pair" },
        ],
        returnType: "number",
        returnDescription: "Current funding rate",
      },
      {
        name: "compareFundingRates",
        httpVerb: "GET",
        path: "/api/v1/derivatives/funding/compare",
        description: "Compare funding across exchanges",
        arguments: [
          { name: "symbol", type: "string", description: "Trading pair" },
        ],
        returnType: "array",
        returnDescription: "Funding rates by exchange",
      },
    ],
    // DEX patterns
    PoolAnalytics: [
      {
        name: "getPoolLiquidity",
        httpVerb: "GET",
        path: "/api/v1/pools/{id}/liquidity",
        description: "Current pool liquidity",
        arguments: [
          { name: "poolId", type: "string", description: "Pool address" },
        ],
        returnType: "object",
        returnDescription: "Liquidity details",
      },
      {
        name: "getTopPools",
        httpVerb: "GET",
        path: "/api/v1/pools/top",
        description: "Top pools by volume",
        arguments: [
          { name: "limit", type: "number", description: "Number of pools" },
        ],
        returnType: "array",
        returnDescription: "Top pools",
      },
    ],
  };

  // Return specific methods if available, otherwise generic
  if (methodsByDomain[className]) {
    return methodsByDomain[className].slice(0, count);
  }

  const base = className.toLowerCase();
  return [
    {
      name: `get${className}Data`,
      httpVerb: "GET",
      path: `/api/v1/${base}/data`,
      description: `Get ${className} data`,
      arguments: [{ name: "id", type: "string", description: "ID" }],
      returnType: "object",
      returnDescription: `${className} data`,
    },
    {
      name: `query${className}`,
      httpVerb: "GET",
      path: `/api/v1/${base}/query`,
      description: `Query ${className}`,
      arguments: [
        { name: "filters", type: "object", description: "Filters" },
      ],
      returnType: "array",
      returnDescription: `Matching ${className} items`,
    },
  ].slice(0, count);
}

/**
 * Generate methods for a class using LLM
 */
async function generateMethodsForClass(
  appData: AppData,
  classData: ClassData
): Promise<MethodData[]> {
  const systemPrompt = `You are a crypto API designer. Generate 5-8 realistic, domain-specific API methods for a ${classData.name} service.

IMPORTANT: 
- NO generic CRUD (avoid: create, update, delete, getById, list)
- Use REAL crypto API patterns from DeFiLlama, CoinGecko, Nansen
- Each method should be a specific business operation

Examples of GOOD methods:
- getTVLByProtocol (not just "getTVL")
- getHistoricalPriceChart (not just "getPrice")  
- comparePoolLiquidity (not just "getLiquidity")
- trackWalletTransfers (not just "getTransactions")
- calculateYieldAPY (not just "getYield")
- getTopCoinsByMarketCap (not just "getCoins")

Each method needs:
- name (camelCase, specific operation)
- httpVerb (mostly GET, occasionally POST for complex queries)
- path (RESTful, e.g. /api/v1/protocols/{id}/tvl/historical)
- description (what it does specifically)
- arguments (relevant params like: symbol, chain, timeframe, limit, address)
- returnType ("array", "object", "number", "string")
- returnDescription (what the response contains)

Return JSON array with this structure:
[
  {
    "name": "getProtocolTVLHistory",
    "httpVerb": "GET",
    "path": "/api/v1/protocols/{protocol}/tvl/history",
    "description": "Get historical TVL data for a specific protocol",
    "arguments": [
      {"name": "protocol", "type": "string", "description": "Protocol slug or ID"},
      {"name": "chain", "type": "string", "description": "Blockchain name"},
      {"name": "days", "type": "number", "description": "Number of days of history"}
    ],
    "returnType": "array",
    "returnDescription": "Array of TVL data points with timestamps"
  }
]

IMPORTANT: Return ONLY valid JSON array. No markdown, no code blocks, no explanations.`;

  const userPrompt = `App: ${appData.name}
Class: ${classData.name}
Description: ${classData.description}

Generate 5-8 domain-specific methods for this class.`;

  try {
    const response = await openai.chat.completions.create({
      model: getModel("utility"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      console.log(`    ⚠️  No response, using fallback methods`);
      return generateFallbackMethods(classData.name, 5);
    }

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
        const arrayValue = Object.values(parsedObj).find((v) =>
          Array.isArray(v)
        );
        if (arrayValue) {
          methods = arrayValue as MethodData[];
        } else {
          console.log(`    ⚠️  Unexpected format, using fallback methods`);
          return generateFallbackMethods(classData.name, 5);
        }
      }
    } else {
      console.log(`    ⚠️  Invalid response, using fallback methods`);
      return generateFallbackMethods(classData.name, 5);
    }

    if (!Array.isArray(methods) || methods.length === 0) {
      console.log(`    ⚠️  Empty array, using fallback methods`);
      return generateFallbackMethods(classData.name, 5);
    }

    // Validate and ensure required fields
    const validMethods: MethodData[] = [];
    for (const method of methods) {
      if (!method.name || typeof method.name !== "string") {
        continue;
      }
      if (!method.path || typeof method.path !== "string") {
        method.path = `/api/v1/${method.name}`;
      }
      if (!method.httpVerb || typeof method.httpVerb !== "string") {
        method.httpVerb = "GET";
      }
      if (!Array.isArray(method.arguments)) {
        method.arguments = [];
      }
      if (!method.returnType) {
        method.returnType = "object";
      }
      if (!method.returnDescription) {
        method.returnDescription = `Returns ${method.name} data`;
      }
      validMethods.push(method);
    }

    if (validMethods.length === 0) {
      console.log(`    ⚠️  No valid methods, using fallback`);
      return generateFallbackMethods(classData.name, 5);
    }

    return validMethods;
  } catch (error) {
    console.log(
      `    ⚠️  Error: ${
        error instanceof Error ? error.message : "Unknown"
      }, using fallback`
    );
    return generateFallbackMethods(classData.name, 5);
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
        // Check if we have predefined classes from the file
        let classes: ClassData[];
        
        if (appData.classes && appData.classes.length > 0) {
          console.log(`  Using ${appData.classes.length} predefined classes from file`);
          classes = appData.classes;
      } else {
        // Generate new classes via LLM
        console.log(`  Generating classes for ${appData.name}...`);
          classes = await generateClassesForApp(appData);
        console.log(`  Generated ${classes.length} classes`);
        // Add delay between LLM calls
        await delay(1500);
        }

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

