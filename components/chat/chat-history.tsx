"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatHistoryProps {
  messages: ChatMessageType[];
}

export function ChatHistory({ messages }: ChatHistoryProps) {
  return (
    <ScrollArea className="flex-1 p-4">
      <div className="flex flex-col gap-4">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            No messages yet. Start a conversation!
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.id} message={message} />
          ))
        )}
      </div>
    </ScrollArea>
  );
}

