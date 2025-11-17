"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  style?: React.CSSProperties;
}

export function ChatMessage({ message, style }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div 
      className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300`}
      style={style}
    >
      {!isUser && (
        <Avatar className="transition-opacity duration-200">
          <AvatarFallback>AI</AvatarFallback>
        </Avatar>
      )}
      <Card
        className={`max-w-[80%] p-4 transition-all duration-200 ${
          isUser ? "bg-primary text-primary-foreground" : "bg-muted"
        }`}
      >
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
      </Card>
      {isUser && (
        <Avatar className="transition-opacity duration-200">
          <AvatarFallback>U</AvatarFallback>
        </Avatar>
      )}
    </div>
  );
}

