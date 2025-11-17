import { openai } from "../openai-client";
import { ResponseDto } from "@/types/tool-selector";

/**
 * Query LLM with context to answer questions about entities
 */
export async function queryLLMWithContext(
  entityType: "app" | "class" | "method",
  entityData: Record<string, any>,
  userQuery: string
): Promise<ResponseDto> {
  console.log(`[meta-tools:llm-query] Querying LLM about ${entityType}`);
  console.log(`[meta-tools:llm-query] User query: "${userQuery.substring(0, 100)}${userQuery.length > 100 ? "..." : ""}"`);

  const systemPrompt = `You are a helpful assistant that answers questions about API tools based on provided context.

Your task is to analyze the provided ${entityType} data and answer the user's question accurately and concisely.

Focus on:
- Providing accurate information based on the context
- Being concise but comprehensive
- Highlighting relevant details that answer the question
- If the question cannot be answered with the provided context, say so clearly

Return your answer as plain text without meta-commentary.`;

  const contextData = JSON.stringify(entityData, null, 2);
  
  const userPrompt = `${entityType.toUpperCase()} Data:
${contextData}

User Question: "${userQuery}"

Please answer the user's question based on the ${entityType} data provided above.`;

  console.log(`[meta-tools:llm-query] Context data length: ${contextData.length} chars`);
  console.log(`[meta-tools:llm-query] Calling gpt-3.5-turbo...`);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.error(`[meta-tools:llm-query] ERROR: No content in LLM response`);
      return {
        content: `I couldn't generate an answer to your question about this ${entityType}.`,
        metadata: { error: "No content in LLM response" },
      };
    }

    console.log(`[meta-tools:llm-query] LLM response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`);

    return {
      content,
      metadata: {
        entityType,
        queryLength: userQuery.length,
        responseLength: content.length,
      },
    };
  } catch (error) {
    console.error(`[meta-tools:llm-query] ERROR calling LLM:`, error);
    return {
      content: `I encountered an error while processing your question about this ${entityType}.`,
      metadata: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

