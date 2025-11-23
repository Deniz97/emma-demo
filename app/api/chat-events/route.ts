import { chatEvents, ChatEvent } from "@/lib/chat-events";

// IMPORTANT: SSE requires Node.js runtime, not Edge
export const runtime = "nodejs";

/**
 * SSE Route Handler for real-time chat updates
 *
 * Establishes a Server-Sent Events connection for a user to receive
 * real-time updates about their chats (status changes, new messages, etc.)
 */
export async function GET(request: Request) {
  // Extract userId from query params
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  if (!userId) {
    return new Response("Missing userId parameter", { status: 400 });
  }

  console.log(
    "[SSE] 🔌 New connection from userId:",
    userId,
    "at",
    new Date().toISOString()
  );

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  let isClosed = false;
  let keepAliveInterval: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Handler for chat updates
      const handleChatUpdate = (event: ChatEvent) => {
        console.log(
          "[SSE] 📬 Event received in handler - eventUserId:",
          event.userId,
          "connUserId:",
          userId,
          "type:",
          event.type,
          "isClosed:",
          isClosed
        );

        // Only send events for this user's chats
        if (event.userId !== userId) {
          console.log("[SSE] ❌ Skipping event - userId mismatch");
          return;
        }

        // Don't send if connection is closed
        if (isClosed) {
          console.log("[SSE] ❌ Skipping event - connection closed");
          return;
        }

        try {
          // Format SSE message
          const data = JSON.stringify(event);
          const message = `data: ${data}\n\n`;
          controller.enqueue(encoder.encode(message));
          console.log(
            "[SSE] ✅ Sent event to userId:",
            userId,
            "type:",
            event.type,
            "chatId:",
            event.chatId
          );
        } catch (error) {
          console.error("[SSE] Error sending event:", error);
        }
      };

      // Register event listener
      chatEvents.on("chat:update", handleChatUpdate);
      console.log("[SSE] Registered event listener for userId:", userId);

      // Send initial connection message
      try {
        const connectionMessage = `data: ${JSON.stringify({ type: "connected", timestamp: new Date() })}\n\n`;
        controller.enqueue(encoder.encode(connectionMessage));
      } catch (error) {
        console.error("[SSE] Error sending connection message:", error);
      }

      // Keep-alive ping every 30 seconds to prevent timeout
      keepAliveInterval = setInterval(() => {
        if (isClosed) {
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
          }
          return;
        }

        try {
          // Send comment (not a data event, just keeps connection alive)
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        } catch (error) {
          console.error("[SSE] Error sending keep-alive:", error);
          if (keepAliveInterval) {
            clearInterval(keepAliveInterval);
          }
        }
      }, 30000);

      // Cleanup on abort signal
      request.signal.addEventListener("abort", () => {
        console.log(
          "[SSE] 🔌 Connection aborted for userId:",
          userId,
          "at",
          new Date().toISOString()
        );
        isClosed = true;
        chatEvents.off("chat:update", handleChatUpdate);
        console.log(
          "[SSE] Event listener removed, remaining listeners:",
          chatEvents.listenerCount("chat:update")
        );
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
        }
        try {
          controller.close();
        } catch {
          // Controller might already be closed
          console.log("[SSE] Controller already closed");
        }
      });
    },

    cancel() {
      console.log("[SSE] Stream cancelled for userId:", userId);
      isClosed = true;
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
      }
    },
  });

  // Return SSE response with proper headers
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  });
}
