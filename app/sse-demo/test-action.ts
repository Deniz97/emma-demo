"use server";

import { chatEvents } from "@/lib/chat-events";

/**
 * Simple diagnostic action to test if event bus is working
 */
export async function testEventBus(userId: string) {
  console.log("\n=== EVENT BUS DIAGNOSTIC ===");
  console.log(
    "Listener count BEFORE emit:",
    chatEvents.listenerCount("chat:update")
  );

  // Emit a simple test event
  console.log("Emitting test event for userId:", userId);
  chatEvents.emitStatusChange(
    userId,
    "test-chat-diagnostic",
    "PROCESSING",
    null
  );

  console.log("Event emitted!");
  console.log(
    "Listener count AFTER emit:",
    chatEvents.listenerCount("chat:update")
  );
  console.log("=== END DIAGNOSTIC ===\n");

  return {
    success: true,
    listeners: chatEvents.listenerCount("chat:update"),
    userId,
  };
}
