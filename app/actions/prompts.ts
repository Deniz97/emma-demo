"use server";

import { prisma } from "@/lib/prisma";

/**
 * Fetches all default prompts from the database
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

    return prompts;
  } catch (error) {
    console.error("Error fetching default prompts:", error);
    return [];
  }
}

