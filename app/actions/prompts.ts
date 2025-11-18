"use server";

import { prisma } from "@/lib/prisma";
import { getCategoryIcon } from "@/lib/utils";

/**
 * Fetches all default prompts from the database with category information
 * Calculates and stores icons if they're missing
 */
export async function getDefaultPrompts() {
  try {
    const prompts = await prisma.defaultPrompt.findMany({
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        prompt: true,
        classIds: true,
        icon: true,
      },
    });

    // Fetch categories for each prompt and calculate/store missing icons
    const promptsWithCategories = await Promise.all(
      prompts.map(async (prompt) => {
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

