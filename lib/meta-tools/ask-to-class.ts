import { ResponseDto } from "@/types/tool-selector";
import { prisma } from "../prisma";
import { queryLLMWithContext } from "./llm-query";

/**
 * Ask a question about one or more classes using LLM
 */
export async function ask_to_classes(
  class_slugs: string[],
  query: string
): Promise<ResponseDto> {
  console.log(
    `[meta-tools:ask-to-classes] Called for ${class_slugs.length} class(es): ${class_slugs.join(", ")}`
  );
  console.log(
    `[meta-tools:ask-to-classes] Query: "${query.substring(0, 100)}${query.length > 100 ? "..." : ""}"`
  );

  try {
    // Fetch all classes with app and all methods
    const classes = await prisma.class.findMany({
      where: { slug: { in: class_slugs } },
      include: {
        app: true,
        methods: true,
      },
    });

    if (classes.length === 0) {
      console.log(
        `[meta-tools:ask-to-classes] No classes found for slugs: ${class_slugs.join(", ")}`
      );
      return {
        yes: false,
        no: false,
        answer: `No classes found with slugs: ${class_slugs.join(", ")}.`,
        metadata: { error: "Classes not found" },
      };
    }

    console.log(
      `[meta-tools:ask-to-classes] Found ${classes.length} class(es)`
    );

    // Prepare merged context data
    const entityData = {
      classes: classes.map((class_) => ({
        slug: class_.slug,
        name: class_.name,
        description: class_.description,
        app: {
          slug: class_.app.slug,
          name: class_.app.name,
          description: class_.app.description,
        },
        methods: class_.methods.map((m) => ({
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
      })),
      totalClasses: classes.length,
      totalMethods: classes.reduce((sum, cls) => sum + cls.methods.length, 0),
    };

    console.log(
      `[meta-tools:ask-to-classes] Prepared context with ${entityData.totalClasses} classes, ${entityData.totalMethods} methods`
    );

    // Query LLM with context
    const result = await queryLLMWithContext("classes", entityData, query);

    console.log(`[meta-tools:ask-to-classes] LLM response generated`);
    return result;
  } catch (error) {
    console.error("[meta-tools:ask-to-classes] ERROR:", error);
    return {
      yes: false,
      no: false,
      answer: `I encountered an error while processing your question about classes: ${class_slugs.join(", ")}.`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
