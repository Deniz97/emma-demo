import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about one or more methods using LLM
 */
export async function ask_to_methods(
  method_slugs: string[],
  query: string
): Promise<ResponseDto> {
  console.log(
    `[meta-tools:ask-to-methods] Called for ${method_slugs.length} method(s): ${method_slugs.join(", ")}`
  );
  console.log(
    `[meta-tools:ask-to-methods] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`
  );

  try {
    // Fetch all methods with class and app
    const methods = await prisma.method.findMany({
      where: { slug: { in: method_slugs } },
      include: {
        class: {
          include: {
            app: true,
          },
        },
      },
    });

    if (methods.length === 0) {
      console.log(
        `[meta-tools:ask-to-methods] No methods found for slugs: ${method_slugs.join(", ")}`
      );
      return {
        yes: false,
        no: false,
        answer: `No methods found with slugs: ${method_slugs.join(", ")}.`,
        metadata: { error: "Methods not found" },
      };
    }

    console.log(
      `[meta-tools:ask-to-methods] Found ${methods.length} method(s)`
    );

    // Prepare merged context data
    const entityData = {
      methods: methods.map((method) => ({
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
      })),
      totalMethods: methods.length,
    };

    console.log(
      `[meta-tools:ask-to-methods] Prepared context with ${entityData.totalMethods} methods`
    );

    // Query LLM with context
    const result = await queryLLMWithContext("methods", entityData, query);

    console.log(`[meta-tools:ask-to-methods] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-methods] ERROR:", error);
    return {
      yes: false,
      no: false,
      answer: `I encountered an error while processing your question about methods: ${method_slugs.join(", ")}.`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
