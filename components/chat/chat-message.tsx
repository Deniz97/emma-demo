"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ChatMessage as ChatMessageType } from "@/types/chat";
import { Bug } from "lucide-react";
import { DebugModal } from "./debug-modal";

interface ChatMessageProps {
  message: ChatMessageType;
  style?: React.CSSProperties;
}

export function ChatMessage({ message, style }: ChatMessageProps) {
  const isUser = message.role === "user";
  const [showDebug, setShowDebug] = useState(false);

  return (
    <>
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
          className={`max-w-[80%] p-4 transition-all duration-200 relative ${
            isUser ? "bg-primary text-primary-foreground" : "bg-muted"
          }`}
        >
          {!isUser && message.metadata && (
            <button
              onClick={() => setShowDebug(true)}
              className="absolute top-2 right-2 p-1 rounded hover:bg-background/10 transition-colors"
              title="Show debug information"
            >
              <Bug className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </Card>
        {isUser && (
          <Avatar className="transition-opacity duration-200">
            <AvatarFallback>U</AvatarFallback>
          </Avatar>
        )}
      </div>

      {!isUser && message.metadata && (
        <DebugModal
          open={showDebug}
          onOpenChange={setShowDebug}
          metadata={message.metadata}
        />
      )}
    </>
  );
}

