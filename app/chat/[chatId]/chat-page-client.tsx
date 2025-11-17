"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatInput } from "@/components/chat/chat-input";
import { getChatById, getChatMessages } from "@/app/actions/chat";
import { ChatMessage, Chat as ChatType } from "@/types/chat";

interface ChatPageClientProps {
  chatId: string;
  initialChat: ChatType & { messages: ChatMessage[] };
}

export function ChatPageClient({
  chatId,
  initialChat,
}: ChatPageClientProps) {
  const { userId, isLoading } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>(initialChat.messages);
  const [chat, setChat] = useState(initialChat);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshMessages = async () => {
    try {
      const updatedMessages = await getChatMessages(chatId);
      setMessages(updatedMessages);
      const updatedChat = await getChatById(chatId);
      if (updatedChat) {
        setChat(updatedChat);
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

  return (
    <div className="flex h-screen">
      <ChatList userId={userId} currentChatId={chatId} refreshTrigger={refreshTrigger} />
      <div className="flex-1 flex flex-col">
        <div className="border-b p-4">
          <h1 className="text-lg font-semibold">{chat.title || "New Chat"}</h1>
        </div>
        <ChatHistory messages={messages} />
        <ChatInput chatId={chatId} onMessageSent={refreshMessages} />
      </div>
    </div>
  );
}

