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
          <div className="mb-2 md:mb-3 px-3 md:px-4 py-1.5 md:py-2 bg-destructive/10 rounded-lg border border-destructive/20 text-destructive text-xs md:text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-sm">
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
          className="flex gap-1.5 md:gap-2 p-2.5 md:p-4 bg-background border rounded-xl shadow-lg transition-all duration-200 hover:shadow-xl"
        >
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            disabled={isLoading || disabled}
            rows={1}
            className="flex-1 min-h-[36px] md:min-h-[40px] max-h-[200px] px-2.5 md:px-3 py-1.5 md:py-2 text-xs md:text-sm rounded-md border border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-none transition-all duration-200"
          />
          <Button
            type="submit"
            disabled={isLoading || !message.trim() || disabled}
            className="self-end transition-all duration-200 text-xs md:text-sm px-3 md:px-4"
            size="sm"
          >
            {isLoading ? (
              <span className="hidden md:inline">Sending...</span>
            ) : (
              <span className="hidden md:inline">Send</span>
            )}
            {/* Mobile: Show icon only */}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="w-4 h-4 md:hidden"
            >
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </Button>
        </form>
      </div>
    );
  }
);
