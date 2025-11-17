"use client";

import { useState, useEffect, useRef, startTransition } from "react";
import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatInput, ChatInputHandle } from "@/components/chat/chat-input";
import { Navigation } from "@/components/navigation";
import { getChatById, getChatMessages } from "@/app/actions/chat";
import { ChatMessage, Chat as ChatType } from "@/types/chat";
import { useSearchParams } from "next/navigation";

interface ChatPageClientProps {
  chatId: string;
  initialChat: (ChatType & { messages: ChatMessage[] }) | null;
}

export function ChatPageClient({
  chatId,
  initialChat,
}: ChatPageClientProps) {
  const { userId, isLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat?.messages || []);
  const [chat, setChat] = useState<ChatType | null>(initialChat);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isInitializing, setIsInitializing] = useState(!initialChat);
  const [isThinking, setIsThinking] = useState(false);
  const previousChatIdRef = useRef<string>(chatId);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const hasAutoSentRef = useRef(false);
  const searchParams = useSearchParams();

  // Update state when navigating to a different chat
  // This syncs component state with the new server-provided data
  useEffect(() => {
    // Only update if chatId actually changed
    // We intentionally update state here to sync URL navigation with component state
    // Using startTransition for non-urgent updates
    if (previousChatIdRef.current !== chatId) {
      previousChatIdRef.current = chatId;
      hasAutoSentRef.current = false; // Reset auto-send flag for new chat
      startTransition(() => {
        setMessages(initialChat?.messages || []);
        setChat(initialChat);
        setIsInitializing(!initialChat);
        setIsThinking(false);
      });
    }

    // If chat doesn't exist, try to load it (in case it was just created)
    if (!initialChat && userId) {
      const loadChat = async () => {
        try {
          const loadedChat = await getChatById(chatId);
          if (loadedChat) {
            startTransition(() => {
              setChat(loadedChat);
              setMessages(loadedChat.messages);
              setIsInitializing(false);
            });
          }
        } catch (error) {
          console.error("Failed to load chat:", error);
          setIsInitializing(false);
        }
      };
      loadChat();
    }
  }, [chatId, initialChat, userId]);

  // Auto-send message from query parameter
  useEffect(() => {
    const prompt = searchParams.get("prompt");
    
    if (
      prompt &&
      !hasAutoSentRef.current &&
      messages.length === 0 &&
      !isThinking &&
      chatInputRef.current
    ) {
      hasAutoSentRef.current = true;
      // Small delay to ensure everything is ready
      setTimeout(() => {
        chatInputRef.current?.sendMessageProgrammatically(prompt);
      }, 100);
    }
  }, [searchParams, messages.length, isThinking]);

  const refreshMessages = async () => {
    try {
      const updatedMessages = await getChatMessages(chatId);
      setMessages(updatedMessages);
      const updatedChat = await getChatById(chatId);
      if (updatedChat) {
        setChat(updatedChat);
        setIsInitializing(false);
      }
      // Trigger chat list refresh
      setRefreshTrigger((prev) => prev + 1);
    } catch (error) {
      console.error("Failed to refresh messages:", error);
    }
  };

  if (isLoading || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const isEmpty = messages.length === 0 && !isInitializing;

  return (
    <div className="flex h-screen flex-col">
      <Navigation />
      <div className="flex flex-1 overflow-hidden">
        <ChatList userId={userId} currentChatId={chatId} refreshTrigger={refreshTrigger} />
        <div className="flex-1 flex flex-col animate-in fade-in duration-200">
          <div className="border-b p-4 transition-all duration-200">
            <h1 className="text-lg font-semibold">
              {chat?.title || "New Chat"}
            </h1>
          </div>
          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4 animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold">Start a conversation</h2>
                <p className="text-muted-foreground max-w-md">
                  Send a message to begin chatting. The chat will be created automatically.
                </p>
              </div>
            </div>
          ) : (
            <ChatHistory messages={messages} isThinking={isThinking} />
          )}
          <ChatInput
            ref={chatInputRef}
            chatId={chatId} 
            onMessageSent={refreshMessages}
            onLoadingChange={setIsThinking}
          />
        </div>
      </div>
    </div>
  );
}

