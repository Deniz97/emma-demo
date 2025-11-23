"use client";

import {
  useState,
  useImperativeHandle,
  forwardRef,
  useRef,
  useEffect,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  chatId?: string | null;
  onMessageSent?: (message?: string) => void;
  onLoadingChange?: (isLoading: boolean) => void;
  disabled?: boolean;
}

export interface ChatInputHandle {
  sendMessageProgrammatically: (messageText: string) => Promise<void>;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput(
    { onMessageSent, onLoadingChange, disabled = false },
    ref
  ) {
    const { userId } = useAuth();
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const sendMessageInternal = async (messageText: string) => {
      if (!messageText.trim() || !userId) return;

      // Clear any previous errors
      setError(null);

      const trimmedMessage = messageText.trim();

      // Clear input immediately for better UX
      setMessage("");

      // Set loading state and notify parent
      setIsLoading(true);
      onLoadingChange?.(true);

      try {
        // Notify parent - parent handles all message creation logic
        onMessageSent?.(trimmedMessage);
      } finally {
        // Reset loading state after a brief delay to allow parent to handle
        // The parent will manage the actual loading state
        setTimeout(() => {
          setIsLoading(false);
          onLoadingChange?.(false);
        }, 100);
      }
    };

    useImperativeHandle(ref, () => ({
      sendMessageProgrammatically: sendMessageInternal,
    }));

    // Auto-resize textarea
    useEffect(() => {
      const textarea = textareaRef.current;
      if (textarea) {
        // Reset height to auto to get the correct scrollHeight
        textarea.style.height = "auto";
        // Set height to scrollHeight (content height)
        const newHeight = Math.min(textarea.scrollHeight, 200); // Max 200px
        textarea.style.height = `${newHeight}px`;
      }
    }, [message]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!message.trim() || isLoading || !userId || disabled) return;

      await sendMessageInternal(message);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!message.trim() || isLoading || !userId || disabled) return;
        sendMessageInternal(message);
      }
    };

    return (
      <div className="max-w-4xl mx-auto">
        {error && (
          <div className="mb-3 px-4 py-2 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-sm">
            <div className="flex items-center justify-between">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="h-6 px-2 hover:bg-destructive/20"
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 p-4 bg-background border rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl"
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message... (Shift+Enter for new line)"
            disabled={isLoading || disabled}
            rows={1}
            className="flex-1 min-h-[40px] max-h-[200px] px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-all duration-200"
          />
          <Button
            type="submit"
            disabled={isLoading || !message.trim() || disabled}
            className="self-end transition-all duration-200"
          >
            {isLoading ? "Sending..." : "Send"}
          </Button>
        </form>
      </div>
    );
  }
);
