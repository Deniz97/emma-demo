"use server";

import { promptsCache } from "@/lib/prompts-cache";

/**
 * Fetches default prompts from the in-memory cache
 * Returns prompts in random order on each call
 * Cache is automatically refreshed every hour
 * @param limit - Maximum number of prompts to return (default: 10)
 */
export async function getDefaultPrompts(limit: number = 10) {
  try {
    // Ensure cache is fresh (will refresh if needed)
    await promptsCache.ensureFresh();

    // Get random prompts from cache
    return promptsCache.getRandom(limit);
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    return [];
  }
}
