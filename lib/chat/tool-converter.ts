import { Method } from "@/types/tool";

/**
 * Converts Method objects to OpenAI function definitions format
 * Each tool accepts a single 'query' parameter (string) and returns a processed string result
 * The description includes information about supported inputs (arguments) and expected outputs (return type)
 */
export function convertMethodsToOpenAITools(methods: Method[]): Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}> {
  return methods.map((method) => {
    // Build input information from method arguments
    const inputInfo =
      method.arguments && method.arguments.length > 0
        ? `\n\nSupported Inputs: This tool accepts queries that reference the following parameters:\n${method.arguments
            .map(
              (arg) =>
                `  - ${arg.name} (${arg.type}): ${
                  arg.description || "No description"
                }`
            )
            .join("\n")}`
        : "";

    // Build output information from return type
    const outputInfo = method.returnType
      ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following type and format: ${
          method.returnType
        }${method.returnDescription ? ` - ${method.returnDescription}` : ""}`
      : method.returnDescription
        ? `\n\nExpected Output: This tool returns an answer to the query in natural language, possibly quoting data conforming to the following format: ${method.returnDescription}`
        : "";

    // Build comprehensive description with input/output information
    const description = `${
      method.description || `Execute ${method.name} tool`
    }${inputInfo}${outputInfo}\n\nIMPORTANT: Your query should only reference concepts that match the supported inputs listed above, and you should only expect data that matches the expected output type.`;

    return {
      type: "function" as const,
      function: {
        name: method.name,
        description,
        parameters: {
          type: "object" as const,
          properties: {
            query: {
              type: "string",
              description:
                "Natural language query describing what you want to know or do with this tool. Only include concepts that match the tool's supported inputs (see description above).",
            },
          },
          required: ["query"],
        },
      },
    };
  });
}
