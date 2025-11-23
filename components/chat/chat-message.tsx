"use client";

import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { ChatMessage as ChatMessageType } from "@/types/chat";
import { Bug } from "lucide-react";
import { DebugModal } from "./debug-modal";
import { EmmaHeartIcon } from "./emma-heart-icon";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface CodeProps extends React.ComponentPropsWithoutRef<"code"> {
  inline?: boolean;
}

interface ChatMessageProps {
  message: ChatMessageType;
  style?: React.CSSProperties;
  isLatestAssistant?: boolean;
}

interface ExtendedMessageMetadata {
  error?: boolean;
  [key: string]: unknown;
}

export function ChatMessage({
  message,
  style,
  isLatestAssistant = false,
}: ChatMessageProps) {
  const isUser = message.role === "user";
  const [showDebug, setShowDebug] = useState(false);
  const hasError =
    (message.metadata as ExtendedMessageMetadata | null | undefined)?.error ===
    true;

  return (
    <>
      <div
        className={`flex gap-2 md:gap-3 ${isUser ? "justify-end" : "justify-start"} animate-in fade-in slide-in-from-bottom-2 duration-300 min-w-0`}
        style={style}
      >
        {!isUser && (
          <Avatar className="transition-opacity duration-200 shrink-0 w-7 h-7 md:w-10 md:h-10">
            <AvatarFallback className="bg-transparent">
              <EmmaHeartIcon
                className={`w-4 h-4 md:w-5 md:h-5 ${isLatestAssistant ? "animate-heartbeat" : ""}`}
              />
            </AvatarFallback>
          </Avatar>
        )}
        <Card
          className={`max-w-[85%] md:max-w-[80%] min-w-0 p-2.5 md:p-4 transition-all duration-200 relative overflow-hidden ${
            hasError
              ? "bg-destructive/10 border-destructive/50 text-destructive"
              : isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted"
          }`}
        >
          {!isUser &&
            message.metadata &&
            !(message.metadata as ExtendedMessageMetadata)?.error && (
              <button
                onClick={() => setShowDebug(true)}
                className="absolute top-1.5 md:top-2 right-1.5 md:right-2 p-0.5 md:p-1 rounded hover:bg-background/10 transition-colors z-10"
                title="Show debug information"
              >
                <Bug className="h-3 w-3 md:h-4 md:w-4 text-muted-foreground hover:text-foreground" />
              </button>
            )}
          {isUser ? (
            <p className="text-xs md:text-sm whitespace-pre-wrap wrap-break-words overflow-wrap-anywhere">
              {message.content}
            </p>
          ) : (
            <div className="text-xs md:text-sm prose prose-xs md:prose-sm dark:prose-invert max-w-none overflow-hidden prose-headings:wrap-break-words prose-p:wrap-break-words prose-li:wrap-break-words prose-strong:wrap-break-words prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:overflow-x-auto prose-pre:max-w-full">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  pre: ({ ...props }) => (
                    <pre
                      {...props}
                      className="overflow-x-auto max-w-full !my-2"
                    />
                  ),
                  code: ({ inline, ...props }: CodeProps) =>
                    inline ? (
                      <code {...props} className="wrap-break-words" />
                    ) : (
                      <code {...props} />
                    ),
                  p: ({ ...props }) => (
                    <p
                      {...props}
                      className="wrap-break-words overflow-wrap-anywhere"
                    />
                  ),
                  li: ({ ...props }) => (
                    <li {...props} className="wrap-break-words" />
                  ),
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          )}
          {hasError && (
            <div className="mt-1.5 md:mt-2 text-[10px] md:text-xs opacity-75">
              ⚠ This message failed to send
            </div>
          )}
        </Card>
        {isUser && (
          <Avatar
            className={`transition-opacity duration-200 shrink-0 w-7 h-7 md:w-10 md:h-10 ${hasError ? "opacity-50" : ""}`}
          >
            <AvatarFallback className="text-xs md:text-sm">U</AvatarFallback>
          </Avatar>
        )}
      </div>

      {!isUser &&
        message.metadata &&
        !(message.metadata as ExtendedMessageMetadata)?.error && (
          <DebugModal
            open={showDebug}
            onOpenChange={setShowDebug}
            metadata={message.metadata}
          />
        )}
    </>
  );
}
