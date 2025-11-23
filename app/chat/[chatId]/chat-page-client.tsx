"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useCurrentChat, useChatList } from "@/lib/chat-context";
import { ChatList } from "@/components/chat/chat-list";
import { ChatHistory } from "@/components/chat/chat-history";
import { ChatInput, ChatInputHandle } from "@/components/chat/chat-input";
import { ChatMessage, Chat as ChatType } from "@/types/chat";
import { createUserMessage } from "@/app/actions/chat";

interface ChatPageClientProps {
  chatId: string;
  initialChat: (ChatType & { messages: ChatMessage[] }) | null;
}

export function ChatPageClient({ chatId, initialChat }: ChatPageClientProps) {
  const { userId, isLoading } = useAuth();
  const { currentChat, setCurrentChatId, refreshCurrentChat, setCachedChat } =
    useCurrentChat();
  const { refreshSingleChat, updateChatStatusOptimistic } = useChatList();
  const [erroredMessage, setErroredMessage] = useState<ChatMessage | null>(
    null
  );
  const [errorText, setErrorText] = useState<string | null>(null);
  const [optimisticMessage, setOptimisticMessage] =
    useState<ChatMessage | null>(null);
  const chatInputRef = useRef<ChatInputHandle>(null);

  // Derive UI state directly from currentChat (no local state needed)
  const isThinking = currentChat?.chat?.lastStatus === "PROCESSING";
  const processingStep = currentChat?.chat?.processingStep || null;

  // Debug: log when processingStep changes
  useEffect(() => {
    console.log("[ChatPageClient] processingStep changed:", processingStep);
  }, [processingStep]);

  // Debug: log when isThinking changes
  useEffect(() => {
    console.log("[ChatPageClient] isThinking changed:", isThinking);
  }, [isThinking]);

  // Update error text based on chat status
  useEffect(() => {
    const chatStatus = currentChat?.chat?.lastStatus;
    const chatLastError = currentChat?.chat?.lastError;

    // Use queueMicrotask to avoid cascading render warning
    queueMicrotask(() => {
      if (chatStatus === "FAIL") {
        setErrorText(chatLastError || "Failed to generate response");
      } else if (chatStatus === "SUCCESS" || chatStatus === null) {
        setErrorText(null);
        setErroredMessage(null);
      }
    });
  }, [currentChat?.chat?.lastStatus, currentChat?.chat?.lastError]);

  // Load chat when chatId changes
  useEffect(() => {
    // Clear optimistic message when switching chats
    // Use a separate effect to avoid cascading renders
    return () => {
      setOptimisticMessage(null);
    };
  }, [chatId]);

  useEffect(() => {
    // If server provided initialChat, cache it to avoid unnecessary fetch
    if (initialChat) {
      setCachedChat(chatId, {
        chat: {
          id: initialChat.id,
          userId: initialChat.userId,
          title: initialChat.title,
          lastStatus: initialChat.lastStatus,
          lastError: initialChat.lastError,
          processingStep: initialChat.processingStep,
          createdAt: initialChat.createdAt,
          updatedAt: initialChat.updatedAt,
        },
        messages: initialChat.messages,
      });
    }

    // Set current chat (will use cache if available)
    setCurrentChatId(chatId);

    // Refresh this chat in the sidebar to ensure it appears (for new chats)
    refreshSingleChat(chatId);
  }, [chatId, initialChat, setCurrentChatId, setCachedChat, refreshSingleChat]);

  const refreshMessages = async () => {
    await refreshCurrentChat();
    // No need to refresh chat list on every message - only refresh current chat
  };

  const handleChatSelect = useCallback(
    (selectedChatId: string) => {
      // Update context immediately for instant UI feedback
      setCurrentChatId(selectedChatId);
    },
    [setCurrentChatId]
  );

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

    // Check if this is the first message (chat doesn't exist yet)
    const isFirstMessage = !currentChat || currentChat.messages.length === 0;

    // Show optimistic UI immediately for all messages
    const tempMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      chatId: chatId,
      role: "user",
      content: message,
      createdAt: new Date(),
      metadata: null,
    };
    setOptimisticMessage(tempMessage);

    // Optimistically update chat card status to PROCESSING immediately
    // This will make isThinking become true via derived state
    updateChatStatusOptimistic(chatId, "PROCESSING");

    if (isFirstMessage) {
      // First message: Wait for chat to be created
      const result = await createUserMessage(chatId, message, userId, true);

      if (result.success) {
        // Fire off refreshes in background - don't wait
        refreshMessages().then(() => {
          // Once real data is loaded, we can clear optimistic
          setOptimisticMessage(null);
        });

        // Refresh only this chat in the list to show PROCESSING status
        refreshSingleChat(chatId);
      } else {
        setOptimisticMessage(null);
        setErrorText(result.error || "Failed to send message");
      }
    } else {
      // Subsequent messages: Fire and forget
      createUserMessage(chatId, message, userId).then((result) => {
        if (result.success) {
          // Fire off refreshes in background
          refreshMessages().then(() => {
            // Once real data is loaded, we can clear optimistic
            setOptimisticMessage(null);
          });

          // Refresh only this chat in the list to show PROCESSING status
          refreshSingleChat(chatId);
        } else {
          setOptimisticMessage(null);
          setErrorText(result.error || "Failed to send message");
        }
      });
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
    displayMessages = [
      ...displayMessages,
      {
        ...erroredMessage,
        metadata: { ...(erroredMessage.metadata || {}), error: true },
      } as ChatMessage,
    ];
  }

  // Show loading FIRST - only show content when we have the CORRECT chat loaded
  const isChatReady = currentChat && currentChat.chat.id === chatId;
  const isEmpty = displayMessages.length === 0;

  return (
    <div className="flex h-screen flex-col">
      <div className="flex flex-1 overflow-hidden">
        <ChatList
          userId={userId}
          currentChatId={chatId}
          onChatSelect={handleChatSelect}
        />
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {!isChatReady ? (
            // LOADING OVERLAY - shows immediately until correct chat loads
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm z-50 animate-in fade-in duration-200">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                </div>
                <p className="text-sm text-muted-foreground">Loading chat...</p>
              </div>
            </div>
          ) : null}

          {/* CHAT CONTENT - always rendered, but overlay hides it when loading */}
          {isChatReady && (
            <>
              <div className="border-b p-4 transition-all duration-200 shrink-0">
                <h1
                  className="text-lg font-semibold truncate"
                  title={currentChat.chat.title || "New Chat"}
                >
                  {currentChat.chat.title || "New Chat"}
                </h1>
              </div>
              {isEmpty ? (
                <div className="flex-1 flex items-center justify-center overflow-hidden">
                  <div className="text-center space-y-4 animate-in fade-in duration-300">
                    <h2 className="text-xl font-semibold">
                      Start a conversation
                    </h2>
                    <p className="text-muted-foreground max-w-md">
                      Send a message to begin chatting. The chat will be created
                      automatically.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <ChatHistory
                    messages={displayMessages}
                    isThinking={isThinking}
                    processingStep={processingStep}
                  />
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
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
