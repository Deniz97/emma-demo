"use client";

import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ThinkingIndicator } from "./thinking-indicator";
import { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatHistoryProps {
  messages: ChatMessageType[];
  isThinking?: boolean;
  processingStep?: string | null;
}

export function ChatHistory({ messages, isThinking = false, processingStep }: ChatHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive or when thinking
  useEffect(() => {
    if (scrollRef.current) {
      const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages.length, isThinking]);

  return (
    <ScrollArea className="flex-1 overflow-hidden" ref={scrollRef}>
      <div className="flex flex-col gap-4 p-4 transition-all duration-200 min-h-full">
        {messages.length === 0 && !isThinking ? (
          <div className="text-center text-muted-foreground py-8 animate-in fade-in duration-300">
            No messages yet. Start a conversation!
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <ChatMessage 
                key={message.id} 
                message={message}
              />
            ))}
            {isThinking && <ThinkingIndicator processingStep={processingStep} />}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

