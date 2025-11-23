"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { ChatEvent } from "./chat-events";

/**
 * Event handler type for chat events
 */
export type ChatEventHandler = (event: ChatEvent) => void;

/**
 * Options for the useChatEvents hook
 */
interface UseChatEventsOptions {
  userId: string | null;
  onEvent?: ChatEventHandler;
  enabled?: boolean;
}

/**
 * Custom hook to manage SSE connection for chat events
 *
 * Establishes EventSource connection and handles real-time updates.
 * Auto-reconnects on disconnect (built into EventSource).
 *
 * @param options - Configuration options
 * @returns Connection state and event handlers
 */
export function useChatEvents(options: UseChatEventsOptions) {
  const { userId, onEvent, enabled = true } = options;
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<(() => void) | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {
    // Only run on client side
    if (typeof window === "undefined") {
      return;
    }

    if (!userId || !enabled) {
      return;
    }

    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    try {
      // Create new EventSource connection
      const eventSource = new EventSource(
        `/api/chat-events?userId=${encodeURIComponent(userId)}`
      );
      eventSourceRef.current = eventSource;

      // Handle incoming messages
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          console.log("[SSE] 📨 Raw event received:", data);

          // Ignore connection message
          if (data.type === "connected") {
            console.log("[SSE] Connected to chat events");
            return;
          }

          console.log(
            "[SSE] 🔔 Calling onEvent handler with:",
            data.type,
            "chatId:",
            data.chatId
          );

          // Handle chat event
          if (onEvent) {
            onEvent(data as ChatEvent);
          } else {
            console.warn("[SSE] ⚠️ No onEvent handler registered!");
          }
        } catch (error) {
          console.error(
            "[SSE] Error parsing event:",
            error,
            "raw data:",
            event.data
          );
        }
      };

      // Handle connection open
      eventSource.onopen = () => {
        console.log("[SSE] Connection opened for userId:", userId);
        setIsConnected(true);
      };

      // Handle errors (including disconnects)
      eventSource.onerror = (error) => {
        console.error("[SSE] Connection error:", error);

        // EventSource automatically tries to reconnect, but we'll clean up
        if (eventSource.readyState === EventSource.CLOSED) {
          console.log("[SSE] Connection closed, will attempt reconnect");
          eventSourceRef.current = null;
          setIsConnected(false);

          // Attempt manual reconnect after a delay
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
          }
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log("[SSE] Attempting manual reconnect...");
            // Use ref to avoid accessing connect before it's declared
            if (connectRef.current) {
              connectRef.current();
            }
          }, 3000);
        }
      };
    } catch (error) {
      console.error("[SSE] Error creating EventSource:", error);
    }
  }, [userId, enabled, onEvent]);

  // Store connect function in ref so it can be accessed in closures
  // Update ref in effect to avoid accessing during render
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // Establish connection when userId changes or hook mounts
  useEffect(() => {
    if (userId && enabled) {
      connect();
    }

    // Cleanup on unmount or when userId changes
    return () => {
      if (eventSourceRef.current) {
        console.log("[SSE] Closing connection for userId:", userId);
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      setIsConnected(false);
    };
  }, [userId, enabled, connect]);

  return {
    isConnected,
  };
}
