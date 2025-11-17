import OpenAI from "openai";

// Spoofed OpenAI client for now
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "sk-placeholder",
  // This will be a mock implementation later
});

