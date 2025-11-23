import { openai } from "./openai-client";
import { ChatMessage } from "@/types/chat";
import { getModel } from "./model-config";

/**
 * Summarizes the user's query with conversation context
 * Analyzes last 10 user messages to understand references and intent
 */
export async function summarizeQueryWithHistory(
  chatHistory: ChatMessage[]
): Promise<string> {
  // Extract last 10 user messages only
  const userMessages = chatHistory
    .filter((msg) => msg.role === "user")
    .slice(-10);

  // If only one message, no need to summarize
  if (userMessages.length === 1) {
    return userMessages[0].content;
  }

  // Build context from user messages
  const conversationContext = userMessages
    .map((msg, idx) => `Message ${idx + 1}: ${msg.content}`)
    .join("\n");

  const systemPrompt = `You are a query analyzer for a cryptocurrency chat assistant. Analyze the conversation to understand what the user wants and what data is needed. Focus on the latest message but consider earlier context for references.`;

  const userPrompt = `Conversation history (last ${userMessages.length} user messages):
${conversationContext}

Provide a comprehensive summary in JSON format:
{
  "summary": "What the user wants (include any references to earlier messages)",
  "dataNeeded": "What specific data/tools are needed to answer this query"
}`;

  try {
    const response = await openai.chat.completions.create({
      model: getModel("querySummarizer"),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      // Fallback to latest message
      return userMessages[userMessages.length - 1].content;
    }

    const parsed = JSON.parse(content);
    const summarized = `${parsed.summary}\n\nData needed: ${parsed.dataNeeded}`;

    console.log(
      `[query-summarizer] Query summarized (${userMessages.length} messages)`
    );
    console.log(
      `[query-summarizer] Summary: ${parsed.summary.substring(0, 100)}...`
    );

    return summarized;
  } catch (error) {
    console.error(
      "[query-summarizer] Summarizer failed:",
      error instanceof Error ? error.message : String(error)
    );
    // Fallback to latest message
    return userMessages[userMessages.length - 1].content;
  }
}
