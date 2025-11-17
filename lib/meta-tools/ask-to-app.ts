import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about a specific app using LLM
 */
export async function ask_to_app(
  app_slug: string,
  query: string
): Promise<ResponseDto> {
  console.log(`[meta-tools:ask-to-app] Called for app "${app_slug}"`);
  console.log(`[meta-tools:ask-to-app] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);

  try {
    // Fetch app with all classes and methods
    const app = await prisma.app.findUnique({
      where: { slug: app_slug },
      include: {
        classes: {
          include: {
            methods: true,
          },
        },
      },
    });

    if (!app) {
      console.log(`[meta-tools:ask-to-app] App not found: ${app_slug}`);
      return {
        content: `App with slug "${app_slug}" not found.`,
        metadata: { error: "App not found" },
      };
    }

    console.log(`[meta-tools:ask-to-app] Found app: ${app.name} with ${app.classes.length} classes`);

    // Prepare context data
    const entityData = {
      slug: app.slug,
      name: app.name,
      description: app.description,
      classes: app.classes.map(cls => ({
        slug: cls.slug,
        name: cls.name,
        description: cls.description,
        methodCount: cls.methods.length,
        methods: cls.methods.map(m => ({
          slug: m.slug,
          name: m.name,
          description: m.description,
          httpVerb: m.httpVerb,
          path: m.path,
        })),
      })),
      totalClasses: app.classes.length,
      totalMethods: app.classes.reduce((sum, cls) => sum + cls.methods.length, 0),
    };

    console.log(`[meta-tools:ask-to-app] Prepared context with ${entityData.totalClasses} classes and ${entityData.totalMethods} methods`);

    // Query LLM with context
    const result = await queryLLMWithContext("app", entityData, query);
    
    console.log(`[meta-tools:ask-to-app] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-app] ERROR:", error);
    return {
      content: `I encountered an error while processing your question about app "${app_slug}".`,
      metadata: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

