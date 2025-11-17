import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about a specific class using LLM
 */
export async function ask_to_class(
  class_slug: string,
  query: string
): Promise<ResponseDto> {
  console.log(`[meta-tools:ask-to-class] Called for class "${class_slug}"`);
  console.log(`[meta-tools:ask-to-class] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);

  try {
    // Fetch class with app and all methods
    const class_ = await prisma.class.findUnique({
      where: { slug: class_slug },
      include: {
        app: true,
        methods: true,
      },
    });

    if (!class_) {
      console.log(`[meta-tools:ask-to-class] Class not found: ${class_slug}`);
      return {
        content: `Class with slug "${class_slug}" not found.`,
        metadata: { error: "Class not found" },
      };
    }

    console.log(`[meta-tools:ask-to-class] Found class: ${class_.name} with ${class_.methods.length} methods`);

    // Prepare context data
    const entityData = {
      slug: class_.slug,
      name: class_.name,
      description: class_.description,
      app: {
        slug: class_.app.slug,
        name: class_.app.name,
        description: class_.app.description,
      },
      methods: class_.methods.map(m => ({
        slug: m.slug,
        name: m.name,
        description: m.description,
        httpVerb: m.httpVerb,
        path: m.path,
        arguments: m.arguments,
        returnType: m.returnType,
        returnDescription: m.returnDescription,
      })),
      totalMethods: class_.methods.length,
    };

    console.log(`[meta-tools:ask-to-class] Prepared context with ${entityData.totalMethods} methods`);

    // Query LLM with context
    const result = await queryLLMWithContext("class", entityData, query);
    
    console.log(`[meta-tools:ask-to-class] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-class] ERROR:", error);
    return {
      content: `I encountered an error while processing your question about class "${class_slug}".`,
      metadata: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

