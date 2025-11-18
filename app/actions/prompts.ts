"use server";

import { prisma } from "@/lib/prisma";
import { getCategoryIcon } from "@/lib/utils";

/**
 * Utility function to shuffle array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Fetches all default prompts from the database with category information
 * Returns prompts in random order on each call
 * Calculates and stores icons if they're missing
 */
export async function getDefaultPrompts() {
  try {
    // Fetch all prompts
    const prompts = await prisma.defaultPrompt.findMany({
      select: {
        id: true,
        prompt: true,
        classIds: true,
        icon: true,
      },
    });

    // Shuffle the prompts randomly
    const shuffledPrompts = shuffleArray(prompts);

    // Fetch categories for each prompt and calculate/store missing icons
    const promptsWithCategories = await Promise.all(
      shuffledPrompts.map(async (prompt) => {
        let categories: Array<{ slug: string; name: string }> = [];
        
        if (prompt.classIds.length > 0) {
          // Get classes and their apps with categories
          const classes = await prisma.class.findMany({
            where: {
              id: {
                in: prompt.classIds,
              },
            },
            select: {
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

          // Extract unique categories
          categories = classes
            .map((cls) => cls.app.category)
            .filter((cat): cat is { slug: string; name: string } => cat !== null)
            .filter(
              (cat, index, self) =>
                index === self.findIndex((c) => c.slug === cat.slug)
            );
        }

        // Calculate icon if missing
        let icon = prompt.icon;
        if (!icon) {
          icon = getCategoryIcon(categories);
          // Store icon back to database (async, non-blocking)
          prisma.defaultPrompt
            .update({
              where: { id: prompt.id },
              data: { icon },
            })
            .catch((error) => {
              console.error(`Failed to update icon for prompt ${prompt.id}:`, error);
            });
        }

        return { ...prompt, categories, icon };
      })
    );

    return promptsWithCategories;
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    return [];
  }
}

