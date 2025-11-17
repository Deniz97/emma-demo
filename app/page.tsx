"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { createChat } from "@/app/actions/chat";

export default function HomePage() {
  const { userId, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && userId) {
      async function createNewChat() {
        if (!userId) return;
        try {
          const chat = await createChat(userId);
          router.push(`/chat/${chat.id}`);
        } catch (error) {
          console.error("Failed to create chat:", error);
        }
      }

      createNewChat();
    }
  }, [userId, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Failed to initialize user</div>
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      <ChatList userId={userId} />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground">Creating new chat...</div>
      </div>
    </div>
  );
}
