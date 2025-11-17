import { openai } from "./openai-client";
import { parseJsonResponse } from "./llm-utils";
import { prisma } from "./prisma";
import type { App, Class, Method } from "@prisma/client";

/**
 * Generate metadata for an App using LLM
 * Returns a record with key-value pairs where values are strings
 */
export async function generateAppMetadata(
  app: App
): Promise<Record<string, string>> {
  const prompt = `You are analyzing a cryptocurrency application API. Extract structured metadata about this app.

App Name: ${app.name}
App Description: ${app.description || "No description provided"}

Generate a JSON object with the following metadata fields. Each field should have a string value (not arrays or nested objects). If a field doesn't apply, use an empty string.

Required fields:
- domain: The primary domain/category (e.g., "cryptocurrency", "defi", "nft", "trading")
- primaryUseCase: Main use case in one sentence
- targetAudience: Who would use this app (e.g., "traders", "developers", "analysts")
- dataTypes: Types of data this app provides (comma-separated, e.g., "prices, volumes, market data")
- integrationComplexity: Complexity level (e.g., "simple", "moderate", "complex")
- rateLimits: Information about rate limits if known, otherwise "unknown"
- authenticationType: Type of auth required (e.g., "api_key", "oauth", "none")

Optional additional fields you can add if relevant:
- supportedChains: Blockchain networks supported
- supportedAssets: Types of assets (e.g., "tokens", "nfts", "pairs")
- updateFrequency: How often data updates
- historicalData: Whether historical data is available

Return ONLY a valid JSON object with string values. Example:
{
  "domain": "cryptocurrency",
  "primaryUseCase": "Real-time price tracking for major cryptocurrencies",
  "targetAudience": "traders and developers",
  "dataTypes": "prices, volumes, market cap",
  "integrationComplexity": "simple",
  "rateLimits": "100 requests per minute",
  "authenticationType": "api_key"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a technical analyst that extracts structured metadata from application descriptions. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = parseJsonResponse(content) as Record<string, unknown>;

    // Convert all values to strings
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        metadata[key] = value;
      } else if (value !== null && value !== undefined) {
        metadata[key] = String(value);
      } else {
        metadata[key] = "";
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error generating app metadata:", error);
    // Return minimal metadata on error
    return {
      domain: "unknown",
      primaryUseCase: app.description || "Unknown",
      targetAudience: "unknown",
      dataTypes: "unknown",
      integrationComplexity: "unknown",
      rateLimits: "unknown",
      authenticationType: "unknown",
    };
  }
}

/**
 * Generate metadata for a Class using LLM
 * Context-aware: includes app information
 */
export async function generateClassMetadata(
  class_: Class,
  app: App
): Promise<Record<string, string>> {
  const prompt = `You are analyzing a class/namespace within a cryptocurrency application API. Extract structured metadata.

App: ${app.name} - ${app.description || "No description"}
Class Name: ${class_.name}
Class Description: ${class_.description || "No description"}

Generate a JSON object with metadata fields. Each field should have a string value.

Required fields:
- category: Category of functionality (e.g., "pricing", "trading", "analytics", "authentication")
- primaryFunction: Main purpose of this class in one sentence
- dataScope: What data this class operates on
- operationType: Type of operations (e.g., "read", "write", "both", "query")
- complexity: Complexity level (e.g., "simple", "moderate", "complex")
- dependencies: What this class depends on (e.g., "none", "external_api", "database")

Optional fields:
- rateLimits: Specific rate limits for this class
- cachingStrategy: Whether responses are cached
- realTime: Whether this provides real-time data

Return ONLY a valid JSON object with string values.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a technical analyst that extracts structured metadata from API class descriptions. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = parseJsonResponse(content) as Record<string, unknown>;

    // Convert all values to strings
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        metadata[key] = value;
      } else if (value !== null && value !== undefined) {
        metadata[key] = String(value);
      } else {
        metadata[key] = "";
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error generating class metadata:", error);
    return {
      category: "unknown",
      primaryFunction: class_.description || "Unknown",
      dataScope: "unknown",
      operationType: "unknown",
      complexity: "unknown",
      dependencies: "unknown",
    };
  }
}

/**
 * Generate metadata for a Method using LLM
 * Context-aware: includes class and app information
 */
export async function generateMethodMetadata(
  method: Method,
  class_: Class,
  app: App
): Promise<Record<string, string>> {
  const args = method.arguments as Array<{
    name: string;
    type: string;
    description: string;
  }>;

  const prompt = `You are analyzing an API method/endpoint within a cryptocurrency application. Extract structured metadata.

App: ${app.name} - ${app.description || "No description"}
Class: ${class_.name} - ${class_.description || "No description"}
Method: ${method.name}
HTTP Verb: ${method.httpVerb}
Path: ${method.path}
Description: ${method.description || "No description"}
Return Type: ${method.returnType || "unknown"}
Return Description: ${method.returnDescription || "No description"}
Arguments: ${JSON.stringify(args, null, 2)}

Generate a JSON object with metadata fields. Each field should have a string value.

Required fields:
- action: What this method does (e.g., "fetch", "create", "update", "delete", "query")
- dataType: Type of data returned (e.g., "price", "volume", "transaction", "balance")
- timeScope: Time scope of data (e.g., "real-time", "historical", "current", "both")
- requiresAuth: Whether authentication is required (e.g., "yes", "no", "optional")
- idempotent: Whether the operation is idempotent (e.g., "yes", "no")
- sideEffects: Whether this has side effects (e.g., "none", "creates_record", "modifies_state")
- useCase: Primary use case in one sentence
- performance: Expected performance characteristics (e.g., "fast", "moderate", "slow")

Optional fields:
- cacheable: Whether response can be cached
- pagination: Whether results are paginated
- filtering: Whether results can be filtered
- sorting: Whether results can be sorted

Return ONLY a valid JSON object with string values.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        {
          role: "system",
          content:
            "You are a technical analyst that extracts structured metadata from API method descriptions. Always return valid JSON.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = parseJsonResponse(content) as Record<string, unknown>;

    // Convert all values to strings
    const metadata: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        metadata[key] = value;
      } else if (value !== null && value !== undefined) {
        metadata[key] = String(value);
      } else {
        metadata[key] = "";
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error generating method metadata:", error);
    return {
      action: "unknown",
      dataType: "unknown",
      timeScope: "unknown",
      requiresAuth: "unknown",
      idempotent: "unknown",
      sideEffects: "unknown",
      useCase: method.description || "Unknown",
      performance: "unknown",
    };
  }
}

