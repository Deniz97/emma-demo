"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatInput } from "@/components/chat/chat-input";
import { Navigation } from "@/components/navigation";
import { getChatById, getChatMessages } from "@/app/actions/chat";
import { ChatMessage, Chat as ChatType } from "@/types/chat";

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

  // If chat doesn't exist, try to load it (in case it was just created)
  useEffect(() => {
    if (!initialChat && userId) {
      const loadChat = async () => {
        try {
          const loadedChat = await getChatById(chatId);
          if (loadedChat) {
            setChat(loadedChat);
            setMessages(loadedChat.messages);
            setIsInitializing(false);
          }
        } catch (error) {
          console.error("Failed to load chat:", error);
          setIsInitializing(false);
        }
      };
      loadChat();
    }
  }, [chatId, initialChat, userId]);

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
            <ChatHistory messages={messages} />
          )}
          <ChatInput chatId={chatId} onMessageSent={refreshMessages} />
        </div>
      </div>
    </div>
  );
}

