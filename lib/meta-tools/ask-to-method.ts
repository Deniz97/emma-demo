import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about a specific method using LLM
 */
export async function ask_to_method(
  method_slug: string,
  query: string
): Promise<ResponseDto> {
  console.log(`[meta-tools:ask-to-method] Called for method "${method_slug}"`);
  console.log(`[meta-tools:ask-to-method] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`);

  try {
    // Fetch method with class and app
    const method = await prisma.method.findUnique({
      where: { slug: method_slug },
      include: {
        class: {
          include: {
            app: true,
          },
        },
      },
    });

    if (!method) {
      console.log(`[meta-tools:ask-to-method] Method not found: ${method_slug}`);
      return {
        content: `Method with slug "${method_slug}" not found.`,
        metadata: { error: "Method not found" },
      };
    }

    console.log(`[meta-tools:ask-to-method] Found method: ${method.name}`);

    // Prepare context data
    const entityData = {
      slug: method.slug,
      name: method.name,
      description: method.description,
      httpVerb: method.httpVerb,
      path: method.path,
      arguments: method.arguments,
      returnType: method.returnType,
      returnDescription: method.returnDescription,
      class: {
        slug: method.class.slug,
        name: method.class.name,
        description: method.class.description,
      },
      app: {
        slug: method.class.app.slug,
        name: method.class.app.name,
        description: method.class.app.description,
      },
    };

    console.log(`[meta-tools:ask-to-method] Prepared context for method ${method.name}`);

    // Query LLM with context
    const result = await queryLLMWithContext("method", entityData, query);
    
    console.log(`[meta-tools:ask-to-method] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-method] ERROR:", error);
    return {
      content: `I encountered an error while processing your question about method "${method_slug}".`,
      metadata: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

