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

    // Collect all unique classIds from all prompts
    const allClassIds = new Set<string>();
    shuffledPrompts.forEach((prompt) => {
      prompt.classIds.forEach((classId) => allClassIds.add(classId));
    });

    // Fetch ALL classes and their categories in a single query (optimized!)
    const classCategoryMap = new Map<
      string,
      Array<{ slug: string; name: string }>
    >();

    if (allClassIds.size > 0) {
      const classes = await prisma.class.findMany({
        where: {
          id: {
            in: Array.from(allClassIds),
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
          // Check if category already exists (avoid duplicates)
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
    }

    // Process prompts and assign categories from the map
    const promptsWithCategories = shuffledPrompts.map((prompt) => {
      // Collect unique categories from all classes in this prompt
      const categoryMap = new Map<string, { slug: string; name: string }>();

      prompt.classIds.forEach((classId) => {
        const categories = classCategoryMap.get(classId) || [];
        categories.forEach((cat) => {
          if (!categoryMap.has(cat.slug)) {
            categoryMap.set(cat.slug, cat);
          }
        });
      });

      const categories = Array.from(categoryMap.values());

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
            console.error(
              `Failed to update icon for prompt ${prompt.id}:`,
              error
            );
          });
      }

      return { ...prompt, categories, icon };
    });

    return promptsWithCategories;
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    return [];
  }
}
