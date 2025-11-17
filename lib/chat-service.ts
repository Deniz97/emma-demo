import { openai } from "./openai-client";

export async function generateResponse(
  messages: Array<{ role: "user" | "assistant"; content: string }>
): Promise<string> {
  // Spoofed implementation - returns placeholder response
  // TODO: Implement actual OpenAI integration later
  return "This is a placeholder response. The AI integration will be implemented later.";
}

