"use client";

import { useAuth } from "@/lib/auth-context";
import { ChatList } from "@/components/chat/chat-list";
import { Navigation } from "@/components/navigation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getDefaultPrompts } from "@/app/actions/prompts";
import { createChat } from "@/app/actions/chat";
import { Card } from "@/components/ui/card";

export default function HomePage() {
  const { userId, isLoading } = useAuth();
  const router = useRouter();
  const [defaultPrompts, setDefaultPrompts] = useState<
    Array<{ id: string; prompt: string; classIds: string[] }>
  >([]);
  const [isLoadingPrompts, setIsLoadingPrompts] = useState(true);

  useEffect(() => {
    async function loadPrompts() {
      setIsLoadingPrompts(true);
      const prompts = await getDefaultPrompts();
      setDefaultPrompts(prompts);
      setIsLoadingPrompts(false);
    }
    loadPrompts();
  }, []);

  const handlePromptClick = async (prompt: string) => {
    if (!userId) return;
    
    try {
      // Create a new chat
      const newChat = await createChat(userId);
      // Navigate to the chat with the prompt as a query parameter
      router.push(`/chat/${newChat.id}?prompt=${encodeURIComponent(prompt)}`);
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

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
        <div className="flex-1 flex items-center justify-center p-8 overflow-auto">
          <div className="max-w-4xl w-full space-y-8 animate-in fade-in duration-300">
            <div className="text-center space-y-4">
              <h2 className="text-2xl font-semibold">Welcome to Emma Demo</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Start a new conversation by clicking "New Chat" or select an existing chat from the sidebar.
                You can also try one of these example prompts:
              </p>
            </div>

            {isLoadingPrompts ? (
              <div className="text-center text-muted-foreground py-8">
                Loading prompts...
              </div>
            ) : defaultPrompts.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <p>No default prompts available yet.</p>
                <p className="text-sm mt-2">
                  Run <code className="bg-muted px-2 py-1 rounded">tsx scripts/generate-default-prompts.ts --limit 10</code> to generate some.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {defaultPrompts.map((defaultPrompt) => (
                  <Card
                    key={defaultPrompt.id}
                    className="p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-[1.02] bg-gradient-to-br from-background to-muted/20 border-2 hover:border-primary/50"
                    onClick={() => handlePromptClick(defaultPrompt.prompt)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-1">
                        <span className="text-primary text-sm font-semibold">💡</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">
                          {defaultPrompt.prompt}
                        </p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="bg-muted px-2 py-0.5 rounded">
                            {defaultPrompt.classIds.length} API{defaultPrompt.classIds.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
