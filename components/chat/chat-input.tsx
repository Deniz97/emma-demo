"use client";

import { useState, useImperativeHandle, forwardRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendMessage } from "@/app/actions/chat";

interface ChatInputProps {
  chatId: string;
  onMessageSent?: () => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export interface ChatInputHandle {
  sendMessageProgrammatically: (messageText: string) => Promise<void>;
}

export const ChatInput = forwardRef<ChatInputHandle, ChatInputProps>(
  function ChatInput({ chatId, onMessageSent, onLoadingChange }, ref) {
    const { userId } = useAuth();
    const [message, setMessage] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const sendMessageInternal = async (messageText: string) => {
      if (!messageText.trim() || !userId) return;

      setIsLoading(true);
      onLoadingChange?.(true);
      try {
        await sendMessage(chatId, messageText.trim(), userId);
        setMessage("");
        onMessageSent?.();
      } catch (error) {
        console.error("Failed to send message:", error);
      } finally {
        setIsLoading(false);
        onLoadingChange?.(false);
      }
    };

    useImperativeHandle(ref, () => ({
      sendMessageProgrammatically: sendMessageInternal,
    }));

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!message.trim() || isLoading || !userId) return;

      await sendMessageInternal(message);
    };

    return (
      <form onSubmit={handleSubmit} className="flex gap-2 p-4 border-t transition-all duration-200">
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={isLoading}
          className="flex-1 transition-all duration-200"
        />
        <Button type="submit" disabled={isLoading || !message.trim()} className="transition-all duration-200">
          {isLoading ? "Sending..." : "Send"}
        </Button>
      </form>
    );
  }
);

