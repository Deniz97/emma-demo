"use client";

import { useAuth } from "@/lib/auth-context";
import { useCurrentChat } from "@/lib/chat-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatInput } from "@/components/chat/chat-input";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getDefaultPrompts } from "@/app/actions/prompts";
import { createChat, createUserMessage } from "@/app/actions/chat";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  const { userId, isLoading } = useAuth();
  const { setCurrentChatId } = useCurrentChat();
  const router = useRouter();

  // Full cache of prompts loaded once
  const [promptsCache, setPromptsCache] = useState<
    Array<{
      id: string;
      prompt: string;
      classIds: string[];
      categories: Array<{ slug: string; name: string }>;
      icon: string;
    }>
  >([]);

  // Currently displayed prompts (sampled from cache)
  const [displayedPrompts, setDisplayedPrompts] = useState<
    Array<{
      id: string;
      prompt: string;
      classIds: string[];
      categories: Array<{ slug: string; name: string }>;
      icon: string;
    }>
  >([]);

  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  // Utility function to shuffle array using Fisher-Yates algorithm
  const shuffleArray = useCallback(<T,>(array: T[]): T[] => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  // Sample random prompts from cache
  const sampleFromCache = useCallback(() => {
    if (promptsCache.length === 0) return;
    const shuffled = shuffleArray(promptsCache);
    setDisplayedPrompts(shuffled.slice(0, 10));
  }, [promptsCache, shuffleArray]);

  // Load prompts cache once on mount
  useEffect(() => {
    async function loadPromptsCache() {
      setIsLoadingPrompts(true);
      const prompts = await getDefaultPrompts(100); // Load 100 prompts
      setPromptsCache(prompts);
      // Show initial random sample
      const shuffled = shuffleArray(prompts);
      setDisplayedPrompts(shuffled.slice(0, 10));
      setIsLoadingPrompts(false);
    }
    loadPromptsCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  // Refresh displayed prompts when page becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sampleFromCache();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sampleFromCache]);

  const handlePromptClick = async (prompt: string) => {
    if (!userId || isCreatingChat) return;

    try {
      setIsCreatingChat(true);
      // Create a new chat
      const newChat = await createChat(userId);
      // Create user message (will trigger async processing)
      const result = await createUserMessage(newChat.id, prompt, userId, true);

      if (result.success) {
        // Hide overlay immediately before navigation
        setIsCreatingChat(false);
        // Navigate - the chat page will handle its own loading state
        router.push(`/chat/${newChat.id}`);
      } else {
        // Show error to user
        alert(result.error || "Failed to create message");
        setIsCreatingChat(false);
      }
    } catch (error) {
      console.error("Failed to create chat or message:", error);
      alert("Failed to create chat or message");
      setIsCreatingChat(false);
    }
  };

  const handleMessageSent = async (message?: string) => {
    if (!userId || isCreatingChat || !message?.trim()) return;

    try {
      setIsCreatingChat(true);
      // Create a new chat
      const newChat = await createChat(userId);
      // Create user message (will trigger async processing)
      const result = await createUserMessage(newChat.id, message, userId, true);

      if (result.success) {
        // Hide overlay immediately before navigation
        setIsCreatingChat(false);
        // Navigate - the chat page will handle its own loading state
        router.push(`/chat/${newChat.id}`);
      } else {
        // Show error to user
        alert(result.error || "Failed to create message");
        setIsCreatingChat(false);
      }
    } catch (error) {
      console.error("Failed to create chat or message:", error);
      alert("Failed to create chat or message");
      setIsCreatingChat(false);
    }
  };

  const handleChatSelect = useCallback(
    (chatId: string) => {
      // Update context immediately for instant UI feedback
      setCurrentChatId(chatId);
    },
    [setCurrentChatId]
  );

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
    <div className="flex h-screen flex-col relative">
      {/* Loading overlay when creating new chat */}
      {isCreatingChat && (
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border rounded-lg p-6 shadow-lg flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent"></div>
            <p className="text-sm text-muted-foreground">Creating chat...</p>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <ChatList userId={userId} onChatSelect={handleChatSelect} />
        <div className="flex-1 flex flex-col animate-in fade-in duration-200 overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-4 overflow-y-auto overflow-x-hidden">
            <div className="max-w-3xl w-full space-y-6 animate-in fade-in duration-300 py-4">
              <div className="text-center space-y-2 relative">
                <div className="flex items-center justify-center">
                  <h2 className="text-xl font-semibold">Welcome to emma 💜</h2>
                  <button
                    onClick={sampleFromCache}
                    disabled={isLoadingPrompts || promptsCache.length === 0}
                    className="absolute right-0 flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 hover:bg-muted transition-all hover:scale-110 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    title="Refresh prompts"
                  >
                    <span className="text-base">🔄</span>
                  </button>
                </div>
                <p className="text-sm text-muted-foreground max-w-xl mx-auto">
                  Take a look at the example questions below, or write your own
                  to get started!
                </p>
              </div>

              {isLoadingPrompts ? (
                <div className="text-center text-muted-foreground py-4 text-sm">
                  Loading prompts...
                </div>
              ) : displayedPrompts.length === 0 ? (
                <div className="text-center text-muted-foreground py-4">
                  <p className="text-sm">No default prompts available yet.</p>
                  <p className="text-xs mt-2">
                    Run{" "}
                    <code className="bg-muted px-2 py-1 rounded text-xs">
                      tsx scripts/generate-default-prompts.ts --limit 10
                    </code>{" "}
                    to generate some.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 max-h-[calc(100vh-20rem)] overflow-y-auto px-1">
                  {displayedPrompts.map((defaultPrompt) => {
                    const categoryName =
                      defaultPrompt.categories.length > 0
                        ? defaultPrompt.categories[0].name
                        : null;
                    return (
                      <Card
                        key={defaultPrompt.id}
                        className="p-3 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/50 bg-card/50 backdrop-blur-sm"
                        onClick={() => handlePromptClick(defaultPrompt.prompt)}
                      >
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                              <span className="text-xs">
                                {defaultPrompt.icon}
                              </span>
                            </div>
                            {categoryName && (
                              <span className="text-[10px] text-muted-foreground truncate">
                                {categoryName}
                              </span>
                            )}
                            <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground whitespace-nowrap ml-auto">
                              {defaultPrompt.classIds.length} API
                              {defaultPrompt.classIds.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed">
                            {defaultPrompt.prompt}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 p-4 pb-6">
            <ChatInput
              chatId={null}
              onMessageSent={handleMessageSent}
              onLoadingChange={() => {}}
              disabled={isCreatingChat}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
