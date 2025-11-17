"use client";

import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { Navigation } from "@/components/navigation";

export default function HomePage() {
  const { userId, isLoading } = useAuth();

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
    <div className="flex h-screen flex-col">
      <Navigation />
      <div className="flex flex-1 overflow-hidden">
        <ChatList userId={userId} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4 animate-in fade-in duration-300">
            <h2 className="text-2xl font-semibold">Welcome to Emma Demo</h2>
            <p className="text-muted-foreground max-w-md">
              Start a new conversation by clicking "New Chat" or select an existing chat from the sidebar.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
