"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { useChatContext } from "@/lib/chat-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatInput, ChatInputHandle } from "@/components/chat/chat-input";
import { Navigation } from "@/components/navigation";
import { ChatMessage, Chat as ChatType } from "@/types/chat";
import { generateAIResponse, deleteMessage, createUserMessage } from "@/app/actions/chat";

interface ChatPageClientProps {
  chatId: string;
  initialChat: (ChatType & { messages: ChatMessage[] }) | null;
}

export function ChatPageClient({
  chatId,
  initialChat,
}: ChatPageClientProps) {
  const { userId, isLoading } = useAuth();
  const { currentChat, setCurrentChatId, refreshCurrentChat, setCachedChat } = useChatContext();
  const [isThinking, setIsThinking] = useState(false);
  const [erroredMessage, setErroredMessage] = useState<ChatMessage | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] = useState<ChatMessage | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);
  const hasGeneratedResponse = useRef<string | null>(null); // Track if we've already started generating for a message

  // Load chat when chatId changes
  useEffect(() => {
    // Clear optimistic message when switching chats
    setOptimisticMessage(null);
    
    // If server provided initialChat, cache it to avoid unnecessary fetch
    if (initialChat) {
      setCachedChat(chatId, {
        chat: {
          id: initialChat.id,
          userId: initialChat.userId,
          title: initialChat.title,
          createdAt: initialChat.createdAt,
          updatedAt: initialChat.updatedAt,
        },
        messages: initialChat.messages,
      });
    }
    
    // Set current chat (will use cache if available)
    setCurrentChatId(chatId);
  }, [chatId, initialChat, setCurrentChatId, setCachedChat]);

  // Auto-generate AI response if last message is from user
  useEffect(() => {
    const messages = currentChat?.messages || [];
    if (messages.length === 0) return;

    const lastMessage = messages[messages.length - 1];
    
    // Check if last message is from user and we haven't already started generating for it
    if (lastMessage.role === "user" && hasGeneratedResponse.current !== lastMessage.id) {
      hasGeneratedResponse.current = lastMessage.id;
      
      // Generate AI response
      (async () => {
        setIsThinking(true);
        setErroredMessage(null);
        setErrorText(null);
        
        try {
          const result = await generateAIResponse(chatId);
          
          if (result.success) {
            // Success - refresh chat to show AI response
            await refreshCurrentChat();
          } else {
            // Error - store the errored message locally and delete it from DB
            setErroredMessage(lastMessage);
            setErrorText(result.error || "Failed to generate response");
            await deleteMessage(lastMessage.id);
            // Refresh to remove deleted message from cache
            await refreshCurrentChat();
          }
        } catch (error) {
          // Unexpected error - store the errored message locally and delete it from DB
          setErroredMessage(lastMessage);
          setErrorText(error instanceof Error ? error.message : "Failed to generate response");
          await deleteMessage(lastMessage.id);
          // Refresh to remove deleted message from cache
          await refreshCurrentChat();
        } finally {
          setIsThinking(false);
        }
      })();
    }
  }, [currentChat?.messages, chatId, refreshCurrentChat, userId]);

  const refreshMessages = async () => {
    await refreshCurrentChat();
    // No need to refresh chat list on every message - only refresh current chat
  };

  const handleNewMessage = async (message?: string) => {
    if (!message || !userId) {
      // If no message provided, just refresh and clear optimistic
      setOptimisticMessage(null);
      await refreshMessages();
      return;
    }

    // Clear any previous errors
    setErroredMessage(null);
    setErrorText(null);
    hasGeneratedResponse.current = null; // Reset to allow new generation

    // Create optimistic message for immediate display
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: chatId,
      role: "user",
      content: message,
      createdAt: new Date(),
      metadata: null,
    };
    setOptimisticMessage(tempMessage);

    // Create user message in database
    const result = await createUserMessage(chatId, message, userId);
    
    if (result.success) {
      // Clear optimistic message and refresh to show real message
      setOptimisticMessage(null);
      await refreshMessages();
    } else {
      // Clear optimistic and show error
      setOptimisticMessage(null);
      setErrorText(result.error || "Failed to send message");
    }
  };

  if (isLoading || !userId) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  const messages = currentChat?.messages || [];
  
  // Build display messages with optimistic and error states
  let displayMessages = [...messages];
  
  // Add optimistic message if present
  if (optimisticMessage) {
    displayMessages = [...displayMessages, optimisticMessage];
  }
  
  // Add errored message to display (it's been deleted from DB but we show it in UI with error state)
  if (erroredMessage) {
    displayMessages = [...displayMessages, { ...erroredMessage, metadata: { ...(erroredMessage.metadata || {}), error: true } } as ChatMessage];
  }

  const isEmpty = displayMessages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <Navigation />
      <div className="flex flex-1 overflow-hidden">
        <ChatList userId={userId} currentChatId={chatId} />
        <div className="flex-1 flex flex-col animate-in fade-in duration-200 overflow-hidden">
          <div className="border-b p-4 transition-all duration-200 shrink-0">
            <h1 className="text-lg font-semibold">
              {currentChat?.chat?.title || "New Chat"}
            </h1>
          </div>
          {isEmpty ? (
            <div className="flex-1 flex items-center justify-center overflow-hidden">
              <div className="text-center space-y-4 animate-in fade-in duration-300">
                <h2 className="text-xl font-semibold">Start a conversation</h2>
                <p className="text-muted-foreground max-w-md">
                  Send a message to begin chatting. The chat will be created automatically.
                </p>
              </div>
            </div>
          ) : (
            <>
              <ChatHistory messages={displayMessages} isThinking={isThinking} />
              {errorText && (
                <div className="px-4 py-3 bg-destructive/10 border-t border-destructive/20 text-destructive text-sm animate-in fade-in slide-in-from-bottom-2 duration-200 shrink-0">
                  <div className="flex items-center justify-between">
                    <span>{errorText}</span>
                    <button
                      onClick={() => {
                        setErrorText(null);
                        setErroredMessage(null);
                      }}
                      className="text-xs hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
          <div className="shrink-0 p-4 pb-6">
            <ChatInput
              ref={chatInputRef}
              chatId={chatId} 
              onMessageSent={handleNewMessage}
              onLoadingChange={setIsThinking}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

