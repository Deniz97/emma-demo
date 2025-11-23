import { prisma } from "@/lib/prisma";
import { getCategoryIcon } from "@/lib/utils";

/**
 * Cached prompt with full category information
 */
export type CachedPrompt = {
  id: string;
  prompt: string;
  classIds: string[];
  categories: Array<{ slug: string; name: string }>;
  icon: string;
};

/**
 * In-memory cache for default prompts
 * Stores up to 500 prompts with full category information
 * Automatically refreshes every hour
 */
class DefaultPromptsCache {
  private cache: CachedPrompt[] = [];
  private lastRefresh: number = 0;
  private refreshPromise: Promise<void> | null = null;
  private readonly maxSize: number = 500;
  private readonly refreshIntervalMs: number = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.initialize();
  }

  /**
   * Initialize cache with automatic refresh interval
   */
  private initialize(): void {
    if (typeof setInterval === "undefined") {
      return; // Not available in this environment
    }

    // Set up automatic cache refresh every hour
    setInterval(() => {
      const now = Date.now();
      const cacheAge = now - this.lastRefresh;

      // Only refresh if cache is stale and no refresh is in progress
      if (cacheAge >= this.refreshIntervalMs && !this.refreshPromise) {
        this.refreshPromise = this.refresh()
          .catch((error) => {
            console.error("Scheduled cache refresh failed:", error);
          })
          .finally(() => {
            this.refreshPromise = null;
          });
      }
    }, this.refreshIntervalMs);

    // Initial cache load (non-blocking)
    this.refresh().catch((error) => {
      console.error("Initial cache load failed:", error);
    });
  }

  /**
   * Utility function to shuffle array using Fisher-Yates algorithm
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  /**
   * Refreshes the in-memory cache with up to 500 prompts from the database
   * Processes categories and icons for all cached prompts
   */
  private async refresh(): Promise<void> {
    try {
      // Fetch up to maxSize prompts from DB
      const prompts = await prisma.$queryRaw<
        Array<{
          id: string;
          prompt: string;
          classIds: string[];
          icon: string | null;
        }>
      >`
        SELECT id, prompt, "classIds", icon
        FROM default_prompts
        LIMIT ${this.maxSize}
      `;

      // Split prompts into two groups: those with icons and those without
      const promptsWithIcons = prompts.filter((p) => p.icon);
      const promptsWithoutIcons = prompts.filter((p) => !p.icon);

      // Process prompts without icons (need categories for icon calculation)
      const processedPromptsWithoutIcons =
        await this.processPromptsWithoutIcons(promptsWithoutIcons);

      // Process prompts with icons (need categories for display)
      const processedPromptsWithIcons =
        await this.processPromptsWithIcons(promptsWithIcons);

      // Update cache
      this.cache = [
        ...processedPromptsWithoutIcons,
        ...processedPromptsWithIcons,
      ];
      this.lastRefresh = Date.now();

      console.log(
        `✅ Default prompts cache refreshed: ${this.cache.length} prompts cached`
      );
    } catch (error) {
      console.error("Error refreshing prompts cache:", error);
      throw error;
    }
  }

  /**
   * Process prompts that don't have icons yet
   * Fetches categories and calculates icons
   */
  private async processPromptsWithoutIcons(
    prompts: Array<{
      id: string;
      prompt: string;
      classIds: string[];
      icon: string | null;
    }>
  ): Promise<CachedPrompt[]> {
    if (prompts.length === 0) {
      return [];
    }

    // Collect unique classIds from prompts without icons
    const classIdsNeeded = new Set<string>();
    prompts.forEach((prompt) => {
      prompt.classIds.forEach((classId) => classIdsNeeded.add(classId));
    });

    // Fetch category information
    const classCategoryMap = await this.fetchClassCategories(
      Array.from(classIdsNeeded)
    );

    // Process each prompt
    return prompts.map((prompt) => {
      const categories = this.collectCategoriesForPrompt(
        prompt.classIds,
        classCategoryMap
      );
      const icon = getCategoryIcon(categories);

      // Store icon back to database (async, non-blocking)
      prisma.defaultPrompt
        .update({
          where: { id: prompt.id },
          data: { icon },
        })
        .catch((error) => {
          console.error(
            `Failed to update icon for prompt ${prompt.id}:`,
            error
          );
        });

      return { ...prompt, categories, icon };
    });
  }

  /**
   * Process prompts that already have icons
   * Still fetches categories for display purposes
   */
  private async processPromptsWithIcons(
    prompts: Array<{
      id: string;
      prompt: string;
      classIds: string[];
      icon: string | null;
    }>
  ): Promise<CachedPrompt[]> {
    if (prompts.length === 0) {
      return [];
    }

    // Collect unique classIds from prompts with icons
    const classIds = new Set<string>();
    prompts.forEach((prompt) => {
      prompt.classIds.forEach((classId) => classIds.add(classId));
    });

    // Fetch category information
    const classCategoryMap = await this.fetchClassCategories(
      Array.from(classIds)
    );

    // Process each prompt
    return prompts.map((prompt) => {
      const categories = this.collectCategoriesForPrompt(
        prompt.classIds,
        classCategoryMap
      );

      return {
        ...prompt,
        categories,
        icon: prompt.icon!,
      };
    });
  }

  /**
   * Fetches category information for a set of class IDs
   */
  private async fetchClassCategories(
    classIds: string[]
  ): Promise<Map<string, Array<{ slug: string; name: string }>>> {
    const classCategoryMap = new Map<
      string,
      Array<{ slug: string; name: string }>
    >();

    if (classIds.length === 0) {
      return classCategoryMap;
    }

    const classes = await prisma.class.findMany({
      where: {
        id: {
          in: classIds,
        },
      },
      select: {
        id: true,
        app: {
          select: {
            category: {
              select: {
                slug: true,
                name: true,
              },
            },
          },
        },
      },
    });

    // Build a map: classId -> categories
    classes.forEach((cls) => {
      if (cls.app.category) {
        const existing = classCategoryMap.get(cls.id) || [];
        const categoryExists = existing.some(
          (cat) => cat.slug === cls.app.category!.slug
        );
        if (!categoryExists) {
          classCategoryMap.set(cls.id, [
            ...existing,
            {
              slug: cls.app.category.slug,
              name: cls.app.category.name,
            },
          ]);
        }
      }
    });

    return classCategoryMap;
  }

  /**
   * Collects unique categories for a prompt based on its class IDs
   */
  private collectCategoriesForPrompt(
    classIds: string[],
    classCategoryMap: Map<string, Array<{ slug: string; name: string }>>
  ): Array<{ slug: string; name: string }> {
    const categoryMap = new Map<string, { slug: string; name: string }>();

    classIds.forEach((classId) => {
      const categories = classCategoryMap.get(classId) || [];
      categories.forEach((cat) => {
        if (!categoryMap.has(cat.slug)) {
          categoryMap.set(cat.slug, cat);
        }
      });
    });

    return Array.from(categoryMap.values());
  }

  /**
   * Ensures the cache is populated and fresh
   * Returns immediately if cache is valid, otherwise refreshes it
   */
  async ensureFresh(): Promise<void> {
    const now = Date.now();
    const cacheAge = now - this.lastRefresh;

    // If cache is empty or older than refresh interval, refresh it
    if (this.cache.length === 0 || cacheAge >= this.refreshIntervalMs) {
      // If a refresh is already in progress, wait for it
      if (this.refreshPromise) {
        await this.refreshPromise;
        return;
      }

      // Start a new refresh
      this.refreshPromise = this.refresh()
        .catch((error) => {
          console.error("Cache refresh failed:", error);
        })
        .finally(() => {
          this.refreshPromise = null;
        });

      await this.refreshPromise;
    }
  }

  /**
   * Gets random prompts from the cache
   * @param limit - Maximum number of prompts to return
   */
  getRandom(limit: number): CachedPrompt[] {
    const shuffled = this.shuffleArray(this.cache);
    return shuffled.slice(0, limit);
  }
}

// Export singleton instance
export const promptsCache = new DefaultPromptsCache();
