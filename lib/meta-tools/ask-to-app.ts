import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about one or more apps using LLM
 */
export async function ask_to_apps(
  app_slugs: string[],
  query: string
): Promise<ResponseDto> {
  console.log(
    `[meta-tools:ask-to-apps] Called for ${app_slugs.length} app(s): ${app_slugs.join(", ")}`
  );
  console.log(
    `[meta-tools:ask-to-apps] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`
  );

  try {
    // Fetch all apps with all classes and methods
    const apps = await prisma.app.findMany({
      where: { slug: { in: app_slugs } },
      include: {
        classes: {
          include: {
            methods: true,
          },
        },
      },
    });

    if (apps.length === 0) {
      console.log(
        `[meta-tools:ask-to-apps] No apps found for slugs: ${app_slugs.join(", ")}`
      );
      return {
        yes: false,
        no: false,
        answer: `No apps found with slugs: ${app_slugs.join(", ")}.`,
        metadata: { error: "Apps not found" },
      };
    }

    console.log(`[meta-tools:ask-to-apps] Found ${apps.length} app(s)`);

    // Prepare merged context data
    const entityData = {
      apps: apps.map((app) => ({
        slug: app.slug,
        name: app.name,
        description: app.description,
        classes: app.classes.map((cls) => ({
          slug: cls.slug,
          name: cls.name,
          description: cls.description,
          methodCount: cls.methods.length,
          methods: cls.methods.map((m) => ({
            slug: m.slug,
            name: m.name,
            description: m.description,
            httpVerb: m.httpVerb,
            path: m.path,
          })),
        })),
        totalClasses: app.classes.length,
        totalMethods: app.classes.reduce(
          (sum, cls) => sum + cls.methods.length,
          0
        ),
      })),
      totalApps: apps.length,
      totalClasses: apps.reduce((sum, app) => sum + app.classes.length, 0),
      totalMethods: apps.reduce(
        (sum, app) =>
          sum + app.classes.reduce((s, cls) => s + cls.methods.length, 0),
        0
      ),
    };

    console.log(
      `[meta-tools:ask-to-apps] Prepared context with ${entityData.totalApps} apps, ${entityData.totalClasses} classes, ${entityData.totalMethods} methods`
    );

    // Query LLM with context
    const result = await queryLLMWithContext("apps", entityData, query);

    console.log(`[meta-tools:ask-to-apps] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-apps] ERROR:", error);
    return {
      yes: false,
      no: false,
      answer: `I encountered an error while processing your question about apps: ${app_slugs.join(", ")}.`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
