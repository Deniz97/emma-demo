import { EventEmitter } from "events";

/**
 * Chat event types for SSE broadcasting
 */
export interface ChatEvent {
  type:
    | "chat:status"
    | "chat:step"
    | "chat:title"
    | "message:new"
    | "chat:created";
  userId: string;
  chatId: string;
  data: {
    status?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
    error?: string | null;
    step?: string | null;
    title?: string | null;
    messageId?: string;
    messageRole?: "user" | "assistant";
    messageContent?: string;
  };
  timestamp: Date;
}

/**
 * Centralized event emitter for chat updates
 * Enables real-time SSE broadcasting to connected clients
 */
class ChatEventEmitter extends EventEmitter {
  /**
   * Emit a chat status change event
   */
  emitStatusChange(
    userId: string,
    chatId: string,
    status: "PROCESSING" | "SUCCESS" | "FAIL" | null,
    error?: string | null
  ) {
    const event: ChatEvent = {
      type: "chat:status",
      userId,
      chatId,
      data: { status, error },
      timestamp: new Date(),
    };
    this.emit("chat:update", event);
    console.log("[ChatEvents] Status change:", { chatId, status, error });
  }

  /**
   * Emit a processing step update event
   */
  emitStepUpdate(userId: string, chatId: string, step: string | null) {
    const event: ChatEvent = {
      type: "chat:step",
      userId,
      chatId,
      data: { step },
      timestamp: new Date(),
    };
    this.emit("chat:update", event);
    console.log("[ChatEvents] Step update:", { chatId, step });
  }

  /**
   * Emit a chat title update event
   */
  emitTitleUpdate(userId: string, chatId: string, title: string) {
    const event: ChatEvent = {
      type: "chat:title",
      userId,
      chatId,
      data: { title },
      timestamp: new Date(),
    };
    console.log(
      "[ChatEvents] 📢 Emitting title update at",
      new Date().toISOString(),
      { userId, chatId, title }
    );
    this.emit("chat:update", event);
    console.log(
      "[ChatEvents] 📢 Title update event emitted, listener count:",
      this.listenerCount("chat:update")
    );
  }

  /**
   * Emit a new message event
   */
  emitNewMessage(
    userId: string,
    chatId: string,
    messageId: string,
    role: "user" | "assistant",
    content: string
  ) {
    const event: ChatEvent = {
      type: "message:new",
      userId,
      chatId,
      data: {
        messageId,
        messageRole: role,
        messageContent: content,
      },
      timestamp: new Date(),
    };
    this.emit("chat:update", event);
    console.log("[ChatEvents] New message:", { chatId, messageId, role });
  }

  /**
   * Emit a new chat created event
   */
  emitChatCreated(userId: string, chatId: string, title?: string | null) {
    const event: ChatEvent = {
      type: "chat:created",
      userId,
      chatId,
      data: { title: title || null },
      timestamp: new Date(),
    };
    this.emit("chat:update", event);
    console.log("[ChatEvents] Chat created:", { chatId, userId });
  }
}

// Export singleton instance with globalThis pattern
// This ensures the same instance is shared across all server contexts
// (SSE routes, server actions, etc.) even during development hot reloads
declare global {
  var __chatEvents: ChatEventEmitter | undefined;
}

export const chatEvents = globalThis.__chatEvents || new ChatEventEmitter();

if (!globalThis.__chatEvents) {
  globalThis.__chatEvents = chatEvents;
  // Increase max listeners to handle multiple SSE connections
  chatEvents.setMaxListeners(100);
  console.log("[ChatEvents] 🎯 Global singleton created");
}
