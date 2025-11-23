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
  const hasYes = /\b(yes|true|correct|indeed|definitely|absolutely)\b/.test(
    start
  );
  // Strong no indicators
  const hasNo = /\b(no|false|not|incorrect|doesn't|don't|cannot|can't)\b/.test(
    start
  );

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
  entityData: Record<string, unknown>,
  userQuery: string
): Promise<ResponseDto> {
  const isYesNo = isYesNoQuestion(userQuery);

  const systemPrompt = `You are a helpful assistant evaluating whether API tools can handle user requests.

Be GENEROUS in your assessment:
- If the ${entityType}'s general domain/category matches the request, answer "Yes"
- Don't worry about exact parameter matches or specific implementation details
- Trust that the main LLM can be creative with available tools
- Focus on whether the tool is in the right ballpark, not whether it's a perfect match

${isYesNo ? 'For yes/no questions: Start with "Yes" if the tool\'s domain can reasonably address the request, or "No" if it\'s completely unrelated.' : ""}

Examples of GOOD reasoning:
- "Yes - this tool handles price data, which can be used for the request"
- "Yes - this is in the DeFi domain, relevant to the query"
- "No - this tool is about NFTs, completely different from the price query"

Return your answer as plain text without meta-commentary.`;

  const contextData = JSON.stringify(entityData, null, 2);

  const userPrompt = `${entityType.toUpperCase()} Data:
${contextData}

User Question: "${userQuery}"

Please answer the user's question based on the ${entityType} data provided above.`;

  const model = getModel("metaTools");

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
      console.error(`[meta-tools:llm-query] No content in response`);
      return {
        yes: false,
        no: false,
        answer: `I couldn't generate an answer to your question about this ${entityType}.`,
        metadata: { error: "No content in LLM response" },
      };
    }

    // Extract yes/no if applicable
    const { yes, no } = isYesNo
      ? extractYesNo(content)
      : { yes: false, no: false };

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
    console.error(
      `[meta-tools:llm-query] ✗`,
      error instanceof Error ? error.message : String(error)
    );
    return {
      yes: false,
      no: false,
      answer: `I encountered an error while processing your question about this ${entityType}.`,
      metadata: {
        error: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
