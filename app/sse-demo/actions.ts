"use server";

import { chatEvents } from "@/lib/chat-events";
import { getChats } from "@/app/actions/chat";

/**
 * Get user's chats for demo purposes
 */
export async function getUserChats(userId: string) {
  const chats = await getChats(userId);

  return chats.map((chat) => ({
    id: chat.id,
    title: chat.title,
    messageCount: chat.messageCount,
    lastStatus: chat.lastStatus,
  }));
}

/**
 * Trigger a test SSE event for demo purposes
 */
export async function triggerTestEvent(
  userId: string,
  chatId: string,
  eventType: "status" | "title" | "message" | "step"
) {
  console.log(
    "[SSE Demo Action] Triggering test event:",
    eventType,
    "for userId:",
    userId,
    "chatId:",
    chatId
  );

  switch (eventType) {
    case "status":
      console.log("[SSE Demo Action] 📤 Emitting PROCESSING status");
      chatEvents.emitStatusChange(userId, chatId, "PROCESSING", null);
      // After 2 seconds, emit success
      setTimeout(() => {
        console.log("[SSE Demo Action] 📤 Emitting SUCCESS status");
        chatEvents.emitStatusChange(userId, chatId, "SUCCESS", null);
      }, 2000);
      break;

    case "title":
      const newTitle = `Test Title - ${new Date().toLocaleTimeString()}`;
      console.log("[SSE Demo Action] 📤 Emitting title update:", newTitle);
      chatEvents.emitTitleUpdate(userId, chatId, newTitle);
      break;

    case "message":
      const msgId = `msg-${Date.now()}`;
      const msgContent = `Test message sent at ${new Date().toLocaleTimeString()}`;
      console.log("[SSE Demo Action] 📤 Emitting new message:", msgId);
      chatEvents.emitNewMessage(userId, chatId, msgId, "assistant", msgContent);
      break;

    case "step":
      console.log("[SSE Demo Action] 📤 Emitting step update");
      chatEvents.emitStepUpdate(userId, chatId, "Processing test step...");
      // After 2 seconds, clear step
      setTimeout(() => {
        console.log("[SSE Demo Action] 📤 Clearing step");
        chatEvents.emitStepUpdate(userId, chatId, null);
      }, 2000);
      break;
  }

  console.log("[SSE Demo Action] ✅ Event emission complete");
  console.log(
    "[SSE Demo Action] Active listeners:",
    chatEvents.listenerCount("chat:update")
  );

  return { success: true };
}
