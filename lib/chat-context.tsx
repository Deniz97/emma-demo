"use client";

import React, { createContext, useContext, useState, useCallback, useMemo, useRef } from "react";
import { getChatById, getChats } from "@/app/actions/chat";
import { ChatMessage, Chat } from "@/types/chat";

interface ChatData {
  chat: Chat;
  messages: ChatMessage[];
}

interface ChatContextType {
  // Chat list
  chats: Array<Chat & { messageCount: number; lastMessageAt: Date | null }>;
  isLoadingChats: boolean;
  loadChatsIfNeeded: (userId: string) => Promise<void>;
  refreshChats: (userId: string) => Promise<void>;

  // Current chat and messages
  currentChatId: string | null;
  currentChat: ChatData | null;
  isLoadingCurrentChat: boolean;
  
  // Actions
  setCurrentChatId: (chatId: string) => void;
  loadChat: (chatId: string) => Promise<void>;
  refreshCurrentChat: () => Promise<void>;
  invalidateChat: (chatId: string) => void;
  
  // Cache management
  getCachedChat: (chatId: string) => ChatData | undefined;
  setCachedChat: (chatId: string, data: ChatData) => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

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
      console.log("[ChatContext] Chats already loaded, skipping");
      return;
    }
    
    console.log("[ChatContext] Loading chats for first time");
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

  // Force refresh all chats (always reloads)
  const refreshChats = useCallback(async (userId: string) => {
    console.log("[ChatContext] Force refreshing chats");
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
      console.log(`[ChatContext] Using cached data for chat ${chatId}`);
      setCurrentChat(cached);
      return;
    }

    console.log(`[ChatContext] Loading chat ${chatId} from server`);
    setIsLoadingCurrentChat(true);
    try {
      const chat = await getChatById(chatId);
      if (chat) {
        const chatData: ChatData = {
          chat: {
            id: chat.id,
            userId: chat.userId,
            title: chat.title,
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

    console.log(`[ChatContext] Refreshing current chat ${currentChatId}`);
    setIsLoadingCurrentChat(true);
    try {
      const chat = await getChatById(currentChatId);
      if (chat) {
        const chatData: ChatData = {
          chat: {
            id: chat.id,
            userId: chat.userId,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
          },
          messages: chat.messages,
        };
        
        // Update cache
        chatCacheRef.current.set(currentChatId, chatData);
        
        setCurrentChat(chatData);
      }
    } catch (error) {
      console.error("Failed to refresh chat:", error);
    } finally {
      setIsLoadingCurrentChat(false);
    }
  }, [currentChatId]);

  // Set current chat ID and load it
  const handleSetCurrentChatId = useCallback((chatId: string) => {
    console.log(`[ChatContext] Setting current chat to ${chatId}`);
    setCurrentChatId(chatId);
    loadChat(chatId);
  }, [loadChat]);

  const value = useMemo<ChatContextType>(() => ({
    chats,
    isLoadingChats,
    loadChatsIfNeeded,
    refreshChats,
    currentChatId,
    currentChat,
    isLoadingCurrentChat,
    setCurrentChatId: handleSetCurrentChatId,
    loadChat,
    refreshCurrentChat,
    invalidateChat,
    getCachedChat,
    setCachedChat,
  }), [
    chats,
    isLoadingChats,
    loadChatsIfNeeded,
    refreshChats,
    currentChatId,
    currentChat,
    isLoadingCurrentChat,
    handleSetCurrentChatId,
    loadChat,
    refreshCurrentChat,
    invalidateChat,
    getCachedChat,
    setCachedChat,
  ]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatContext() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return context;
}

