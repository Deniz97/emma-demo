"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  useEffect,
} from "react";
import { getChatById, getChats, getChatMetadata } from "@/app/actions/chat";
import { ChatMessage, Chat } from "@/types/chat";
import { useChatEvents } from "./use-chat-events";
import { ChatEvent } from "./chat-events";

interface ChatData {
  chat: Chat;
  messages: ChatMessage[];
}

// Split into two contexts to prevent unnecessary re-renders
interface ChatListContextType {
  chats: Array<Chat & { messageCount: number; lastMessageAt: Date | null }>;
  isLoadingChats: boolean;
  loadChatsIfNeeded: (userId: string) => Promise<void>;
  refreshChats: (userId: string) => Promise<void>;
  refreshSingleChat: (chatId: string) => Promise<void>;
  updateChatStatusOptimistic: (
    chatId: string,
    status: "PROCESSING" | "SUCCESS" | "FAIL"
  ) => void;
  invalidateChat: (chatId: string) => void;
  setUserIdForSSE: (userId: string) => void;
}

interface CurrentChatContextType {
  currentChatId: string | null;
  currentChat: ChatData | null;
  isLoadingCurrentChat: boolean;
  setCurrentChatId: (chatId: string) => void;
  loadChat: (chatId: string) => Promise<void>;
  refreshCurrentChat: (silent?: boolean) => Promise<void>;
  getCachedChat: (chatId: string) => ChatData | undefined;
  setCachedChat: (chatId: string, data: ChatData) => void;
}

const ChatListContext = createContext<ChatListContextType | undefined>(
  undefined
);
const CurrentChatContext = createContext<CurrentChatContextType | undefined>(
  undefined
);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<
    Array<Chat & { messageCount: number; lastMessageAt: Date | null }>
  >([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const chatsLoadedRef = useRef(false); // Track if chats have been loaded

  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatData | null>(null);
  const [isLoadingCurrentChat, setIsLoadingCurrentChat] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Cache for chat data (chatId -> ChatData) - using ref to avoid re-renders
  const chatCacheRef = useRef<Map<string, ChatData>>(new Map());

  // Set userId (this will trigger SSE connection)
  const setUserIdForSSE = useCallback((newUserId: string) => {
    console.log("[ChatContext] Setting userId for SSE:", newUserId);
    setUserId(newUserId);
  }, []);

  // Debug: log when userId changes
  useEffect(() => {
    console.log("[ChatContext] userId changed:", userId);
    if (userId) {
      console.log("[ChatContext] SSE should be connecting now...");
    }
  }, [userId]);

  // Load all chats for a user (only if not already loaded)
  const loadChatsIfNeeded = useCallback(
    async (userIdParam: string) => {
      // Set userId for SSE if not already set
      if (!userId) {
        setUserId(userIdParam);
      }

      if (chatsLoadedRef.current) {
        return;
      }

      setIsLoadingChats(true);
      try {
        const fetchedChats = await getChats(userIdParam);
        setChats(fetchedChats);
        chatsLoadedRef.current = true;
      } catch (error) {
        console.error("Failed to load chats:", error);
      } finally {
        setIsLoadingChats(false);
      }
    },
    [userId]
  );

  // Force refresh all chats (always reloads) - silently without loading state
  const refreshChats = useCallback(async (userId: string) => {
    try {
      const fetchedChats = await getChats(userId);
      setChats(fetchedChats);
      chatsLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load chats:", error);
    }
  }, []);

  // Optimistically update chat status (immediate, no backend call)
  const updateChatStatusOptimistic = useCallback(
    (chatId: string, status: "PROCESSING" | "SUCCESS" | "FAIL") => {
      setChats((prevChats) => {
        const existingIndex = prevChats.findIndex((c) => c.id === chatId);

        if (existingIndex >= 0) {
          // Update existing chat with new status and current timestamp
          const updatedChat = {
            ...prevChats[existingIndex],
            lastStatus: status,
            lastMessageAt: new Date(),
            updatedAt: new Date(),
          };

          // Remove chat from current position
          const newChats = prevChats.filter((c) => c.id !== chatId);

          // Add updated chat at the beginning (top of list)
          return [updatedChat, ...newChats];
        }

        // Chat not in list yet - nothing to update optimistically
        return prevChats;
      });
    },
    []
  );

  // Refresh single chat in the list (optimized)
  const refreshSingleChat = useCallback(async (chatId: string) => {
    console.log("[refreshSingleChat] Refreshing chat in list:", chatId);
    try {
      const chatMetadata = await getChatMetadata(chatId);
      if (!chatMetadata) {
        console.warn("[refreshSingleChat] Chat not found:", chatId);
        return;
      }

      console.log("[refreshSingleChat] Got metadata:", {
        id: chatMetadata.id,
        title: chatMetadata.title,
        status: chatMetadata.lastStatus,
      });

      // Update the chat in the list
      setChats((prevChats) => {
        const existingIndex = prevChats.findIndex((c) => c.id === chatId);

        if (existingIndex >= 0) {
          // Update existing chat
          const newChats = [...prevChats];
          newChats[existingIndex] = chatMetadata;

          // Re-sort: new chats (no messages) first, then by last message date
          return newChats.sort((a, b) => {
            const aHasMessages = a.messageCount > 0;
            const bHasMessages = b.messageCount > 0;

            if (!aHasMessages && bHasMessages) return -1;
            if (aHasMessages && !bHasMessages) return 1;

            if (aHasMessages && bHasMessages) {
              const aLastMessage = a.lastMessageAt || a.updatedAt;
              const bLastMessage = b.lastMessageAt || b.updatedAt;
              return bLastMessage.getTime() - aLastMessage.getTime();
            }

            return b.createdAt.getTime() - a.createdAt.getTime();
          });
        } else {
          // New chat - add to the list
          const newChats = [...prevChats, chatMetadata];

          // Sort
          return newChats.sort((a, b) => {
            const aHasMessages = a.messageCount > 0;
            const bHasMessages = b.messageCount > 0;

            if (!aHasMessages && bHasMessages) return -1;
            if (aHasMessages && !bHasMessages) return 1;

            if (aHasMessages && bHasMessages) {
              const aLastMessage = a.lastMessageAt || a.updatedAt;
              const bLastMessage = b.lastMessageAt || b.updatedAt;
              return bLastMessage.getTime() - aLastMessage.getTime();
            }

            return b.createdAt.getTime() - a.createdAt.getTime();
          });
        }
      });
    } catch (error) {
      console.error("Failed to refresh single chat:", error);
    }
  }, []);

  // Get chat from cache
  const getCachedChat = useCallback((chatId: string) => {
    return chatCacheRef.current.get(chatId);
  }, []);

  // Set chat in cache
  const setCachedChat = useCallback((chatId: string, data: ChatData) => {
    chatCacheRef.current.set(chatId, data);
  }, []);

  // Invalidate a chat in the cache (force reload next time)
  const invalidateChat = useCallback((chatId: string) => {
    chatCacheRef.current.delete(chatId);
  }, []);

  // Load a specific chat (uses cache if available)
  const loadChat = useCallback(async (chatId: string) => {
    // Check cache first
    const cached = chatCacheRef.current.get(chatId);
    if (cached) {
      setCurrentChat(cached);
      return;
    }

    setIsLoadingCurrentChat(true);
    try {
      const chat = await getChatById(chatId);
      if (chat) {
        const chatData: ChatData = {
          chat: {
            id: chat.id,
            userId: chat.userId,
            title: chat.title,
            lastStatus: chat.lastStatus,
            lastError: chat.lastError,
            processingStep: chat.processingStep,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
          },
          messages: chat.messages,
        };

        // Update cache
        chatCacheRef.current.set(chatId, chatData);

        setCurrentChat(chatData);
      }
    } catch (error) {
      console.error("Failed to load chat:", error);
    } finally {
      setIsLoadingCurrentChat(false);
    }
  }, []);

  // Refresh current chat (bypasses cache)
  const refreshCurrentChat = useCallback(
    async (silent = false) => {
      if (!currentChatId) {
        console.log("[refreshCurrentChat] No currentChatId, skipping");
        return;
      }

      console.log(
        `[refreshCurrentChat] Refreshing chat ${currentChatId} (silent: ${silent})`
      );

      // Only show loading state if not silent
      if (!silent) {
        setIsLoadingCurrentChat(true);
      }

      try {
        const chat = await getChatById(currentChatId);
        if (chat) {
          console.log("[refreshCurrentChat] Got chat data:", {
            id: chat.id,
            title: chat.title,
            status: chat.lastStatus,
            step: chat.processingStep,
            messageCount: chat.messages.length,
          });

          const chatData: ChatData = {
            chat: {
              id: chat.id,
              userId: chat.userId,
              title: chat.title,
              lastStatus: chat.lastStatus,
              lastError: chat.lastError,
              processingStep: chat.processingStep,
              createdAt: chat.createdAt,
              updatedAt: chat.updatedAt,
            },
            messages: chat.messages,
          };

          // Update cache
          chatCacheRef.current.set(currentChatId, chatData);

          setCurrentChat(chatData);
          console.log("[refreshCurrentChat] Updated currentChat state");
        } else {
          // Chat not found - don't clear the current chat, it might be loading
          console.warn("[refreshCurrentChat] Chat not found:", currentChatId);
        }
      } catch (error) {
        console.error("[refreshCurrentChat] Error:", error);
      } finally {
        if (!silent) {
          setIsLoadingCurrentChat(false);
        }
      }
    },
    [currentChatId]
  );

  // Set current chat ID and load it
  const handleSetCurrentChatId = useCallback(
    (chatId: string) => {
      setCurrentChatId(chatId);
      loadChat(chatId);
    },
    [loadChat]
  );

  // Handle SSE events - these update the context state
  const handleChatEvent = useCallback(
    (event: ChatEvent) => {
      console.log(
        "[ChatContext] Received SSE event:",
        event.type,
        "chatId:",
        event.chatId,
        "data:",
        event.data
      );

      switch (event.type) {
        case "chat:created":
          // Refresh single chat to add it to the list
          refreshSingleChat(event.chatId);
          break;

        case "chat:status":
          // Update status in sidebar
          refreshSingleChat(event.chatId);

          // If this is the current chat, update state directly (instant, no DB fetch)
          if (
            event.chatId === currentChatId &&
            event.data.status !== undefined
          ) {
            console.log(
              "[ChatContext] Updating current chat status:",
              event.data.status
            );
            setCurrentChat((prev) =>
              prev
                ? {
                    ...prev,
                    chat: {
                      ...prev.chat,
                      lastStatus: event.data.status || null,
                      lastError: event.data.error || null,
                    },
                  }
                : prev
            );
          }
          break;

        case "chat:title":
          console.log(
            "[ChatContext] 🎯 Received chat:title event!",
            "chatId:",
            event.chatId,
            "title:",
            event.data.title,
            "currentChatId:",
            currentChatId
          );

          // Update title in sidebar DIRECTLY from event (no DB fetch needed)
          if (event.data.title !== undefined) {
            console.log(
              "[ChatContext] 📝 Updating chat title in sidebar:",
              event.data.title
            );
            setChats((prevChats) => {
              const chatIndex = prevChats.findIndex(
                (c) => c.id === event.chatId
              );
              if (chatIndex >= 0) {
                const newChats = [...prevChats];
                newChats[chatIndex] = {
                  ...newChats[chatIndex],
                  title: event.data.title || null,
                  updatedAt: new Date(), // Update timestamp
                };
                return newChats;
              }
              return prevChats;
            });
          }

          // If this is the current chat, also update current chat state directly
          if (
            event.chatId === currentChatId &&
            event.data.title !== undefined
          ) {
            console.log(
              "[ChatContext] ✅ Updating current chat title:",
              event.data.title
            );
            setCurrentChat((prev) =>
              prev
                ? {
                    ...prev,
                    chat: {
                      ...prev.chat,
                      title: event.data.title || null,
                    },
                  }
                : prev
            );
          }
          break;

        case "message:new":
          // Refresh current chat to get the new message (requires DB fetch)
          if (event.chatId === currentChatId) {
            refreshCurrentChat(true);
          }
          // Also refresh the chat in the sidebar
          refreshSingleChat(event.chatId);
          break;

        case "chat:step":
          // Update processing step directly for current chat (instant, no DB fetch)
          console.log(
            "[ChatContext] Step event - chatId:",
            event.chatId,
            "currentChatId:",
            currentChatId,
            "step:",
            event.data.step
          );
          if (event.chatId === currentChatId && event.data.step !== undefined) {
            console.log(
              "[ChatContext] ✅ Updating processing step in state:",
              event.data.step
            );
            setCurrentChat((prev) => {
              console.log(
                "[ChatContext] Current state before update:",
                prev?.chat?.processingStep
              );
              const updated = prev
                ? {
                    ...prev,
                    chat: {
                      ...prev.chat,
                      processingStep: event.data.step || null,
                    },
                  }
                : prev;
              console.log(
                "[ChatContext] New state after update:",
                updated?.chat?.processingStep
              );
              return updated;
            });
          } else {
            console.log(
              "[ChatContext] ❌ NOT updating step - either different chat or step is undefined"
            );
          }
          break;
      }
    },
    [currentChatId, refreshCurrentChat, refreshSingleChat]
  );

  // Initialize SSE connection in the provider (not in individual components)
  useChatEvents({
    userId,
    onEvent: handleChatEvent,
    enabled: !!userId,
  });

  // Memoize chat list context - only updates when chat list changes
  const chatListValue = useMemo<ChatListContextType>(
    () => ({
      chats,
      isLoadingChats,
      loadChatsIfNeeded,
      refreshChats,
      refreshSingleChat,
      updateChatStatusOptimistic,
      invalidateChat,
      setUserIdForSSE,
    }),
    [
      chats,
      isLoadingChats,
      loadChatsIfNeeded,
      refreshChats,
      refreshSingleChat,
      updateChatStatusOptimistic,
      invalidateChat,
      setUserIdForSSE,
    ]
  );

  // Memoize current chat context - only updates when current chat changes
  const currentChatValue = useMemo<CurrentChatContextType>(
    () => ({
      currentChatId,
      currentChat,
      isLoadingCurrentChat,
      setCurrentChatId: handleSetCurrentChatId,
      loadChat,
      refreshCurrentChat,
      getCachedChat,
      setCachedChat,
    }),
    [
      currentChatId,
      currentChat,
      isLoadingCurrentChat,
      handleSetCurrentChatId,
      loadChat,
      refreshCurrentChat,
      getCachedChat,
      setCachedChat,
    ]
  );

  return (
    <ChatListContext.Provider value={chatListValue}>
      <CurrentChatContext.Provider value={currentChatValue}>
        {children}
      </CurrentChatContext.Provider>
    </ChatListContext.Provider>
  );
}

// Hook for chat list (doesn't re-render when current chat changes)
export function useChatList() {
  const context = useContext(ChatListContext);
  if (context === undefined) {
    throw new Error("useChatList must be used within a ChatProvider");
  }
  return context;
}

// Hook for current chat (doesn't re-render when chat list changes)
export function useCurrentChat() {
  const context = useContext(CurrentChatContext);
  if (context === undefined) {
    throw new Error("useCurrentChat must be used within a ChatProvider");
  }
  return context;
}
