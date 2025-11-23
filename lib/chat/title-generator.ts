import { openai } from "../openai-client";
import { getModelParams } from "../model-config";
import { ChatMessage } from "@/types/chat";

/**
 * Generates a concise title for a chat conversation using LLM
 * Returns a short, descriptive title based on the conversation context
 */
export async function generateChatTitle(
  chatHistory: ChatMessage[]
): Promise<string> {
  // Get recent messages (last 20 messages to keep context manageable)
  const recentMessages = chatHistory.slice(-20);

  // Build conversation context
  const conversationContext = recentMessages
    .map(
      (msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`
    )
    .join("\n\n");

  const systemPrompt = `You are a helpful assistant that generates concise, descriptive titles for chat conversations. 
Generate a title that captures the main topic or theme of the conversation. 
The title should be:
- Short (3-8 words)
- Descriptive of the conversation's main focus
- In title case
- No quotes or special formatting

Return ONLY the title text, nothing else.`;

  const userPrompt = `Based on this conversation, generate a concise title:

${conversationContext}

Title:`;

  try {
    const response = await openai.chat.completions.create({
      ...getModelParams("utility", {
        maxTokens: 50,
        temperature: 0.7,
      }),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (!title) {
      throw new Error("No title generated");
    }

    // Clean up the title (remove quotes, extra whitespace)
    const cleanTitle = title.replace(/^["']|["']$/g, "").trim();

    // Fallback if title is too long or empty
    if (cleanTitle.length === 0 || cleanTitle.length > 100) {
      return "Chat Conversation";
    }

    return cleanTitle;
  } catch (error) {
    console.error("[title-generator] Error generating title:", error);
    // Fallback to a default title
    return "Chat Conversation";
  }
}
