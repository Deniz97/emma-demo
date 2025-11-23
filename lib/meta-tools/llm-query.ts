import { openai } from "../openai-client";
import { ResponseDto } from "@/types/tool-selector";
import { getModel } from "../model-config";

/**
 * Detect if a query is a yes/no question
 */
function isYesNoQuestion(query: string): boolean {
  const lowerQuery = query.toLowerCase().trim();
  const yesNoPatterns = [
    /^(is|are|does|do|can|could|would|should|will|has|have|was|were)\b/,
    /\b(yes|no|true|false)\??$/,
    /\?$/,
  ];
  
  // Check for yes/no indicators
  for (const pattern of yesNoPatterns) {
    if (pattern.test(lowerQuery)) {
      // Additional check: avoid "what is", "who is" type questions
      if (!/^(what|who|where|when|why|how)\b/.test(lowerQuery)) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Extract yes/no from answer text
 */
function extractYesNo(answer: string): { yes: boolean; no: boolean } {
  const lowerAnswer = answer.toLowerCase();
  
  // Check first 100 characters for clear yes/no indicators
  const start = lowerAnswer.substring(0, 100);
  
  // Strong yes indicators
  const hasYes = /\b(yes|true|correct|indeed|definitely|absolutely)\b/.test(start);
  // Strong no indicators
  const hasNo = /\b(no|false|not|incorrect|doesn't|don't|cannot|can't)\b/.test(start);
  
  // If both or neither, default to no decision
  if (hasYes && !hasNo) {
    return { yes: true, no: false };
  } else if (hasNo && !hasYes) {
    return { yes: false, no: true };
  }
  
  // Default: uncertain
  return { yes: false, no: false };
}

/**
 * Query LLM with context to answer questions about entities
 */
export async function queryLLMWithContext(
  entityType: "app" | "class" | "method" | "apps" | "classes" | "methods",
  entityData: Record<string, any>,
  userQuery: string
): Promise<ResponseDto> {
  console.log(`[meta-tools:llm-query] Querying LLM about ${entityType}`);
  console.log(`[meta-tools:llm-query] User query: "${userQuery.substring(0, 100)}${userQuery.length > 100 ? "..." : ""}"`);

  const isYesNo = isYesNoQuestion(userQuery);
  console.log(`[meta-tools:llm-query] Detected as yes/no question: ${isYesNo}`);

  const systemPrompt = `You are a helpful assistant that answers questions about API tools based on provided context.

Your task is to analyze the provided ${entityType} data and answer the user's question accurately and concisely.

${isYesNo ? 'This appears to be a yes/no question. Start your answer with "Yes" or "No" clearly, then provide explanation.' : ''}

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
  const model = getModel("metaTools");
  console.log(`[meta-tools:llm-query] Calling ${model}...`);

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const content = response.choices[0]?.message?.content;

    if (!content) {
      console.error(`[meta-tools:llm-query] ERROR: No content in LLM response`);
      return {
        yes: false,
        no: false,
        answer: `I couldn't generate an answer to your question about this ${entityType}.`,
        metadata: { error: "No content in LLM response" },
      };
    }

    console.log(`[meta-tools:llm-query] LLM response: "${content.substring(0, 100)}${content.length > 100 ? "..." : ""}"`);

    // Extract yes/no if applicable
    const { yes, no } = isYesNo ? extractYesNo(content) : { yes: false, no: false };

    return {
      yes,
      no,
      answer: content,
      metadata: {
        entityType,
        queryLength: userQuery.length,
        responseLength: content.length,
        isYesNoQuestion: isYesNo,
      },
    };
  } catch (error) {
    console.error(`[meta-tools:llm-query] ERROR calling LLM:`, error);
    return {
      yes: false,
      no: false,
      answer: `I encountered an error while processing your question about this ${entityType}.`,
      metadata: { 
        error: error instanceof Error ? error.message : String(error)
      },
    };
  }
}

