"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import { getChatById, getChats, getChatMetadata } from "@/app/actions/chat";
import { ChatMessage, Chat } from "@/types/chat";

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
  updateChatStatusOptimistic: (chatId: string, status: "PROCESSING" | "SUCCESS" | "FAIL") => void;
  invalidateChat: (chatId: string) => void;
}

interface CurrentChatContextType {
  currentChatId: string | null;
  currentChat: ChatData | null;
  isLoadingCurrentChat: boolean;
  setCurrentChatId: (chatId: string) => void;
  loadChat: (chatId: string) => Promise<void>;
  refreshCurrentChat: () => Promise<void>;
  getCachedChat: (chatId: string) => ChatData | undefined;
  setCachedChat: (chatId: string, data: ChatData) => void;
}

const ChatListContext = createContext<ChatListContextType | undefined>(undefined);
const CurrentChatContext = createContext<CurrentChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Array<Chat & { messageCount: number; lastMessageAt: Date | null }>>([]);
  const [isLoadingChats, setIsLoadingChats] = useState(false);
  const chatsLoadedRef = useRef(false); // Track if chats have been loaded
  
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [currentChat, setCurrentChat] = useState<ChatData | null>(null);
  const [isLoadingCurrentChat, setIsLoadingCurrentChat] = useState(false);
  
  // Cache for chat data (chatId -> ChatData) - using ref to avoid re-renders
  const chatCacheRef = useRef<Map<string, ChatData>>(new Map());

  // Load all chats for a user (only if not already loaded)
  const loadChatsIfNeeded = useCallback(async (userId: string) => {
    if (chatsLoadedRef.current) {
      return;
    }
    
    setIsLoadingChats(true);
    try {
      const fetchedChats = await getChats(userId);
      setChats(fetchedChats);
      chatsLoadedRef.current = true;
    } catch (error) {
      console.error("Failed to load chats:", error);
    } finally {
      setIsLoadingChats(false);
    }
  }, []);

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
  const updateChatStatusOptimistic = useCallback((chatId: string, status: "PROCESSING" | "SUCCESS" | "FAIL") => {
    setChats(prevChats => {
      const existingIndex = prevChats.findIndex(c => c.id === chatId);
      
      if (existingIndex >= 0) {
        // Update existing chat with new status and current timestamp
        const updatedChat = {
          ...prevChats[existingIndex],
          lastStatus: status,
          lastMessageAt: new Date(),
          updatedAt: new Date(),
        };
        
        // Remove chat from current position
        const newChats = prevChats.filter(c => c.id !== chatId);
        
        // Add updated chat at the beginning (top of list)
        return [updatedChat, ...newChats];
      }
      
      // Chat not in list yet - nothing to update optimistically
      return prevChats;
    });
  }, []);

  // Refresh single chat in the list (optimized)
  const refreshSingleChat = useCallback(async (chatId: string) => {
    try {
      const chatMetadata = await getChatMetadata(chatId);
      if (!chatMetadata) {
        console.warn("[refreshSingleChat] Chat not found:", chatId);
        return;
      }

      // Update the chat in the list
      setChats(prevChats => {
        const existingIndex = prevChats.findIndex(c => c.id === chatId);
        
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
  const refreshCurrentChat = useCallback(async () => {
    if (!currentChatId) return;

    setIsLoadingCurrentChat(true);
    try {
      const chat = await getChatById(currentChatId);
      if (chat) {
        const chatData: ChatData = {
          chat: {
            id: chat.id,
            userId: chat.userId,
            title: chat.title,
            lastStatus: chat.lastStatus,
            lastError: chat.lastError,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
          },
          messages: chat.messages,
        };
        
        // Update cache
        chatCacheRef.current.set(currentChatId, chatData);
        
        setCurrentChat(chatData);
      } else {
        // Chat not found - don't clear the current chat, it might be loading
        console.warn("[refreshCurrentChat] Chat not found:", currentChatId);
      }
    } catch (error) {
      console.error("Failed to refresh chat:", error);
    } finally {
      setIsLoadingCurrentChat(false);
    }
  }, [currentChatId]);

  // Set current chat ID and load it
  const handleSetCurrentChatId = useCallback((chatId: string) => {
    setCurrentChatId(chatId);
    loadChat(chatId);
  }, [loadChat]);

  // Memoize chat list context - only updates when chat list changes
  const chatListValue = useMemo<ChatListContextType>(() => ({
    chats,
    isLoadingChats,
    loadChatsIfNeeded,
    refreshChats,
    refreshSingleChat,
    updateChatStatusOptimistic,
    invalidateChat,
  }), [chats, isLoadingChats, loadChatsIfNeeded, refreshChats, refreshSingleChat, updateChatStatusOptimistic, invalidateChat]);

  // Memoize current chat context - only updates when current chat changes
  const currentChatValue = useMemo<CurrentChatContextType>(() => ({
    currentChatId,
    currentChat,
    isLoadingCurrentChat,
    setCurrentChatId: handleSetCurrentChatId,
    loadChat,
    refreshCurrentChat,
    getCachedChat,
    setCachedChat,
  }), [currentChatId, currentChat, isLoadingCurrentChat, handleSetCurrentChatId, loadChat, refreshCurrentChat, getCachedChat, setCachedChat]);

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

