"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card } from "@/components/ui/card";
import { deleteChat } from "@/app/actions/chat";
import { useChatContext } from "@/lib/chat-context";

interface ChatListProps {
  userId: string;
  currentChatId?: string;
}

export function ChatList({ userId, currentChatId }: ChatListProps) {
  const router = useRouter();
  const { chats, isLoadingChats, loadChatsIfNeeded, refreshChats, invalidateChat } = useChatContext();

  const handleNewChat = () => {
    // Navigate to home page (new chat screen)
    router.push("/");
  };

  const handleDeleteChat = async (
    e: React.MouseEvent,
    chatId: string
  ) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Are you sure you want to delete this chat?")) {
      try {
        await deleteChat(chatId);
        invalidateChat(chatId); // Remove from cache
        await refreshChats(userId); // Refresh list
        // If we deleted the current chat, redirect to home
        if (chatId === currentChatId) {
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to delete chat:", error);
      }
    }
  };

  const formatDate = (date: Date) => {
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
  };

  // Load chats only when userId changes (on mount or user switch) - but only if not already loaded
  useEffect(() => {
    if (userId) {
      loadChatsIfNeeded(userId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]); // Only depend on userId, not loadChatsIfNeeded

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
                <div key={chat.id} className="relative group animate-in fade-in slide-in-from-left-2 duration-200">
                  <Link href={`/chat/${chat.id}`}>
                    <Card
                      className={`p-3 cursor-pointer transition-all duration-200 hover:bg-muted ${
                        currentChatId === chat.id ? "bg-muted" : ""
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {chat.title || "New Chat"}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
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
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

