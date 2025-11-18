"use client";

import { useEffect, memo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { deleteChat } from "@/app/actions/chat";
import { useChatList } from "@/lib/chat-context";

interface ChatListProps {
  userId: string;
  currentChatId?: string;
  onChatSelect?: (chatId: string) => void;
}

// Helper function to truncate text to a specific word limit
const truncateToWords = (text: string, wordLimit: number) => {
  const words = text.split(' ');
  if (words.length <= wordLimit) return text;
  return words.slice(0, wordLimit).join(' ') + '...';
};

interface ChatCardProps {
  chat: {
    id: string;
    title: string | null;
    lastStatus?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
    lastError?: string | null;
    messageCount: number;
    createdAt: Date;
    lastMessageAt: Date | null;
  };
  currentChatId?: string;
  formatDate: (date: Date) => string;
  handleDeleteChat: (e: React.MouseEvent, chatId: string) => void;
  onChatSelect?: (chatId: string) => void;
}

// Status icon component
const StatusIcon = ({ status }: { status?: "PROCESSING" | "SUCCESS" | "FAIL" | null }) => {
  console.log("[StatusIcon] status:", status);
  
  if (!status) return null;
  
  if (status === "PROCESSING") {
    return (
      <div className="flex items-center justify-center w-5 h-5 shrink-0" title="Processing...">
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent"></div>
      </div>
    );
  }
  
  if (status === "FAIL") {
    return (
      <div className="flex items-center justify-center w-5 h-5 shrink-0 text-destructive" title="Failed">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  
  // Temporarily show icon for SUCCESS too, to verify data is flowing
  if (status === "SUCCESS") {
    return (
      <div className="flex items-center justify-center w-5 h-5 shrink-0 text-green-600" title="Success">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
        </svg>
      </div>
    );
  }
  
  return null;
};

// Memoize individual chat card to prevent unnecessary re-renders
const ChatCard = memo(({ 
  chat, 
  currentChatId, 
  formatDate, 
  handleDeleteChat,
  onChatSelect 
}: ChatCardProps) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Call onChatSelect to update context immediately
    if (onChatSelect) {
      onChatSelect(chat.id);
    }
    // Link will handle navigation
  }, [chat.id, onChatSelect]);

  return (
    <div className="relative group">
      <Link href={`/chat/${chat.id}`} prefetch={false} onClick={handleClick}>
        <Card
          className={`p-3 cursor-pointer transition-all duration-200 hover:bg-muted/80 ${
            currentChatId === chat.id 
              ? "bg-primary/10 border-primary/30 shadow-sm" 
              : "border-transparent"
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-sm font-semibold leading-snug line-clamp-2 flex-1">
                {truncateToWords(chat.title || "New Chat", 8)}
                </div>
                <StatusIcon status={chat.lastStatus} />
              </div>
              <div className="text-xs text-muted-foreground">
                {chat.messageCount} message
                {chat.messageCount !== 1 ? "s" : ""}
              </div>
              <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                <div>
                  Created: {formatDate(chat.createdAt)}
                </div>
                {chat.lastMessageAt && (
                  <div>
                    Last: {formatDate(chat.lastMessageAt)}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={(e) => handleDeleteChat(e, chat.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive text-xs px-2 py-1"
              title="Delete chat"
            >
              ×
            </button>
          </div>
        </Card>
      </Link>
    </div>
  );
}, (prevProps, nextProps) => {
  // Only re-render if chat data or selection changes
  return (
    prevProps.chat.id === nextProps.chat.id &&
    prevProps.chat.title === nextProps.chat.title &&
    prevProps.chat.messageCount === nextProps.chat.messageCount &&
    prevProps.chat.lastStatus === nextProps.chat.lastStatus &&
    prevProps.chat.lastMessageAt?.getTime() === nextProps.chat.lastMessageAt?.getTime() &&
    prevProps.currentChatId === nextProps.currentChatId &&
    prevProps.onChatSelect === nextProps.onChatSelect
  );
});

ChatCard.displayName = "ChatCard";

export const ChatList = memo(function ChatList({ userId, currentChatId, onChatSelect }: ChatListProps) {
  const router = useRouter();
  const { chats, isLoadingChats, loadChatsIfNeeded, refreshChats, invalidateChat } = useChatList();

  // Poll for chat list updates when any chat is processing
  useEffect(() => {
    // Check if any chat is currently processing
    const hasProcessingChat = chats.some(chat => chat.lastStatus === "PROCESSING");
    
    if (!hasProcessingChat || !userId) {
      return;
    }

    // Poll every 2 seconds while processing
    const interval = setInterval(() => {
      refreshChats(userId);
    }, 2000);

    return () => clearInterval(interval);
  }, [chats, userId, refreshChats]);

  const handleNewChat = useCallback(() => {
    router.push("/");
  }, [router]);

  const handleDeleteChat = useCallback(async (
    e: React.MouseEvent,
    chatId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      try {
        await deleteChat(chatId);
        invalidateChat(chatId);
        await refreshChats(userId);
        // If we deleted the current chat, redirect to home
        if (chatId === currentChatId) {
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    }
  }, [userId, currentChatId, router, invalidateChat, refreshChats]);

  const formatDate = useCallback((date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return "Today";
    } else if (diffDays === 1) {
      return "Yesterday";
    } else if (diffDays < 7) {
      return `${diffDays} days ago`;
    } else {
      return date.toLocaleDateString();
    }
  }, []);

  // Load chats only when userId changes (on mount or user switch) - but only if not already loaded
  useEffect(() => {
    if (userId) {
      loadChatsIfNeeded(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // Only depend on userId, not loadChatsIfNeeded

  // Debug: log chats data
  useEffect(() => {
    console.log("[ChatList] chats:", chats.map(c => ({ 
      id: c.id, 
      title: c.title, 
      lastStatus: c.lastStatus,
      messageCount: c.messageCount 
    })));
  }, [chats]);

  return (
    <div className="w-64 border-r flex flex-col">
      <div className="p-4 border-b">
        <Button onClick={handleNewChat} className="w-full">
          New Chat
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2">
          {isLoadingChats ? (
            <div className="text-center text-muted-foreground py-4">
              Loading...
            </div>
          ) : chats.length === 0 ? (
            <div className="text-center text-muted-foreground py-4">
              No chats yet
            </div>
          ) : (
            <div className="space-y-2">
              {chats.map((chat) => (
                <ChatCard
                  key={chat.id}
                  chat={chat}
                  currentChatId={currentChatId}
                  formatDate={formatDate}
                  handleDeleteChat={handleDeleteChat}
                  onChatSelect={onChatSelect}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

