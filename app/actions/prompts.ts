"use server";

import { prisma } from "@/lib/prisma";

/**
 * Fetches all default prompts from the database with category information
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
      },
    });

    // Fetch categories for each prompt
    const promptsWithCategories = await Promise.all(
      prompts.map(async (prompt) => {
        if (prompt.classIds.length === 0) {
          return { ...prompt, categories: [] };
        }

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
        const categories = classes
          .map((cls) => cls.app.category)
          .filter((cat): cat is { slug: string; name: string } => cat !== null)
          .filter(
            (cat, index, self) =>
              index === self.findIndex((c) => c.slug === cat.slug)
          );

        return { ...prompt, categories };
      })
    );

    return promptsWithCategories;
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    return [];
  }
}

