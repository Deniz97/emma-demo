#!/usr/bin/env tsx
/**
 * Simple test script to trigger the chat service with a message
 * Usage: npm run test-chat
 */

// Load environment variables
import dotenv from "dotenv";
dotenv.config();

import { generateResponse } from "../lib/chat-service";
import { ChatMessage } from "../types/chat";

async function testChat() {
  console.log("🧪 Starting chat service test...\n");

  // Create a simple chat history with one user message
  const chatHistory: ChatMessage[] = [
    {
      id: "test-msg-1",
      chatId: "test-chat-1",
      role: "user",
      content: "What's the current price of Bitcoin?",
      createdAt: new Date(),
    },
  ];

  console.log("📤 Sending message:", chatHistory[0].content);
  console.log("⏳ Waiting for response...\n");

  try {
    const response = await generateResponse(chatHistory);
    
    console.log("\n✅ Response received:");
    console.log("─".repeat(60));
    console.log(response);
    console.log("─".repeat(60));
  } catch (error) {
    console.error("\n❌ Error:", error);
    throw error;
  }
}

// Run the test
testChat()
  .then(() => {
    console.log("\n✅ Test completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  });

