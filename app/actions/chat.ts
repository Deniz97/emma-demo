"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { generateResponse } from "@/lib/chat-service";
import { MessageMetadata, ChatMessage } from "@/types/chat";
import { z } from "zod";
import { generateChatTitle } from "@/lib/chat/title-generator";
import { chatEvents } from "@/lib/chat-events";

const createChatSchema = z.object({
  userId: z.string().min(1),
  title: z.string().optional(),
});

const sendMessageSchema = z.object({
  chatId: z.string().min(1),
  content: z.string().min(1),
});

export async function createChat(userId: string, title?: string) {
  const validated = createChatSchema.parse({ userId, title });

  const chat = await prisma.chat.create({
    data: {
      userId: validated.userId,
      title: validated.title || null,
    },
  });

  // Emit chat created event
  chatEvents.emitChatCreated(chat.userId, chat.id, chat.title);

  return chat;
}

// Get single chat metadata for chat list (without full messages)
export async function getChatMetadata(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  if (!chat) return null;

  return {
    id: chat.id,
    userId: chat.userId,
    title: chat.title,
    lastStatus: chat.lastStatus as "PROCESSING" | "SUCCESS" | "FAIL" | null,
    lastError: chat.lastError,
    processingStep: chat.processingStep,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat._count.messages,
    lastMessageAt: chat.messages[0]?.createdAt || null,
  };
}

export async function getChats(userId: string) {
  const chats = await prisma.chat.findMany({
    where: { userId },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  // Sort: new chats (no messages) first, then by last message date
  const sortedChats = chats.sort((a, b) => {
    const aHasMessages = a._count.messages > 0;
    const bHasMessages = b._count.messages > 0;

    // New chats (no messages) come first
    if (!aHasMessages && bHasMessages) return -1;
    if (aHasMessages && !bHasMessages) return 1;

    // If both have messages, sort by last message date (most recent first)
    if (aHasMessages && bHasMessages) {
      const aLastMessage = a.messages[0]?.createdAt || a.updatedAt;
      const bLastMessage = b.messages[0]?.createdAt || b.updatedAt;
      return bLastMessage.getTime() - aLastMessage.getTime();
    }

    // If both are new, sort by creation date (newest first)
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return sortedChats.map((chat) => ({
    id: chat.id,
    userId: chat.userId,
    title: chat.title,
    lastStatus: chat.lastStatus as "PROCESSING" | "SUCCESS" | "FAIL" | null,
    lastError: chat.lastError,
    processingStep: chat.processingStep,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    messageCount: chat._count.messages,
    lastMessageAt: chat.messages[0]?.createdAt || null,
  }));
}

export async function getChatById(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!chat) return null;

  return {
    ...chat,
    lastStatus: chat.lastStatus as "PROCESSING" | "SUCCESS" | "FAIL" | null,
    lastError: chat.lastError,
    processingStep: chat.processingStep,
    messages: chat.messages.map((msg) => ({
      ...msg,
      role: msg.role as "user" | "assistant",
      metadata: msg.metadata as MessageMetadata | null,
    })),
  };
}

// Get chat status for polling
export async function getChatStatus(chatId: string) {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    select: {
      id: true,
      lastStatus: true,
      lastError: true,
      processingStep: true,
    },
  });

  if (!chat) return null;

  return {
    id: chat.id,
    lastStatus: chat.lastStatus as "PROCESSING" | "SUCCESS" | "FAIL" | null,
    lastError: chat.lastError,
    processingStep: chat.processingStep,
  };
}

export async function getChatMessages(chatId: string) {
  const messages = await prisma.chatMessage.findMany({
    where: { chatId },
    orderBy: { createdAt: "asc" },
  });

  return messages.map((msg) => ({
    ...msg,
    role: msg.role as "user" | "assistant",
    metadata: msg.metadata as MessageMetadata | null,
  }));
}

// Async message processing function
async function processMessageAsync(chatId: string) {
  console.log("[processMessageAsync] Starting processing for chat:", chatId);
  try {
    // Get chat history
    const chatHistory = await getChatMessages(chatId);
    console.log(
      "[processMessageAsync] Got chat history, message count:",
      chatHistory.length
    );

    if (chatHistory.length === 0) {
      throw new Error("No messages in chat");
    }

    const lastMessage = chatHistory[chatHistory.length - 1];
    if (lastMessage.role !== "user") {
      throw new Error("Last message is not from user");
    }

    // Count user messages to check if we should regenerate title
    const userMessageCount = chatHistory.filter(
      (msg) => msg.role === "user"
    ).length;
    // Regenerate title on first message and every 10th message (10th, 20th, 30th, etc.)
    const shouldRegenerateTitle =
      userMessageCount === 1 || userMessageCount % 10 === 0;

    // Get chat to access userId for events
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { userId: true },
    });

    if (!chat) {
      throw new Error("Chat not found");
    }

    const { userId } = chat;

    // Create callback to update processing step in database
    const updateStep = async (step: string) => {
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          processingStep: step,
          updatedAt: new Date(),
        },
      });

      // Emit step update event
      chatEvents.emitStepUpdate(userId, chatId, step);
    };

    // Generate AI response using tool selection
    const aiResponse = await generateResponse(chatHistory, updateStep);

    // Log metadata before saving to verify structure
    console.log(
      "[chat-actions] About to save metadata with mainLLM.toolCalls:",
      aiResponse.metadata.mainLLM?.toolCalls?.map((tc) => ({
        toolName: tc.toolName,
        queryLength: tc.query?.length || 0,
        processedResultLength: tc.processedResult?.length || 0,
        hasQuery: !!tc.query,
        hasProcessedResult: !!tc.processedResult,
      }))
    );

    // Generate title BEFORE setting status to SUCCESS (so polling picks it up)
    if (shouldRegenerateTitle) {
      console.log(
        `[processMessageAsync] Generating title for chat ${chatId} (${userMessageCount} user message${userMessageCount === 1 ? "" : "s"})`
      );
      // Build updated chat history with the new assistant response
      const updatedChatHistory: ChatMessage[] = [
        ...chatHistory,
        {
          id: "temp-assistant",
          chatId: chatId,
          role: "assistant",
          content: aiResponse.content,
          createdAt: new Date(),
          metadata: aiResponse.metadata,
        },
      ];

      try {
        const newTitle = await generateChatTitle(updatedChatHistory);
        console.log(`[processMessageAsync] Title generated: "${newTitle}"`);

        // Save title to database immediately (while still PROCESSING)
        await prisma.chat.update({
          where: { id: chatId },
          data: {
            title: newTitle,
            updatedAt: new Date(),
          },
        });
        console.log(`[processMessageAsync] Title saved to database`);

        // Emit title update event
        chatEvents.emitTitleUpdate(userId, chatId, newTitle);
      } catch (error) {
        console.error(
          "[processMessageAsync] Error generating/saving title:",
          error
        );
        // Don't throw - title generation failure shouldn't break the flow
      }
    }

    // Create assistant message with metadata and update chat status
    const assistantMessage = await prisma.$transaction(async (tx) => {
      // Create assistant message
      const message = await tx.chatMessage.create({
        data: {
          chatId: chatId,
          role: "assistant",
          content: aiResponse.content,
          metadata: aiResponse.metadata as Prisma.InputJsonValue,
        },
      });

      // Update chat status to SUCCESS and clear processing step
      await tx.chat.update({
        where: { id: chatId },
        data: {
          lastStatus: "SUCCESS",
          lastError: null,
          processingStep: null,
          updatedAt: new Date(),
        },
      });

      return message;
    });

    // Emit new message event
    chatEvents.emitNewMessage(
      userId,
      chatId,
      assistantMessage.id,
      "assistant",
      assistantMessage.content
    );

    // Emit status change to SUCCESS
    chatEvents.emitStatusChange(userId, chatId, "SUCCESS", null);
  } catch (error) {
    console.error("Error in processMessageAsync:", error);

    const errorMessage =
      error instanceof Error ? error.message : "Failed to generate response";

    // Get userId for event
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      select: { userId: true },
    });

    // Update chat status to FAIL with error message and clear processing step
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastStatus: "FAIL",
        lastError: errorMessage,
        processingStep: null,
        updatedAt: new Date(),
      },
    });

    // Emit status change to FAIL
    if (chat) {
      chatEvents.emitStatusChange(chat.userId, chatId, "FAIL", errorMessage);
    }
  }
}

// Create user message only (optimistic update)
export async function createUserMessage(
  chatId: string,
  content: string,
  userId?: string,
  isFirstMessageParam?: boolean
) {
  const validated = sendMessageSchema.parse({ chatId, content });

  try {
    // Check if chat exists, create it if it doesn't
    let chat = await prisma.chat.findUnique({
      where: { id: validated.chatId },
    });

    let isNewChat = false;
    if (!chat) {
      if (!userId) {
        throw new Error("Cannot create chat: userId is required");
      }
      // Create the chat lazily on first message
      chat = await prisma.chat.create({
        data: {
          id: validated.chatId,
          userId: userId,
          title: null,
        },
      });
      isNewChat = true;
    }

    const chatUserId = chat.userId;

    // Get existing messages to check if last message is from user
    const existingMessages = await getChatMessages(validated.chatId);
    const lastMessage = existingMessages[existingMessages.length - 1];

    // If last message is from user, delete it
    let isFirstMessage: boolean;
    if (lastMessage && lastMessage.role === "user") {
      await prisma.chatMessage.delete({
        where: { id: lastMessage.id },
      });
      // After deletion, check if this will be the first message
      isFirstMessage =
        isFirstMessageParam !== undefined
          ? isFirstMessageParam
          : existingMessages.length === 1; // Only the deleted message existed
    } else {
      // Check if this is the first message (skip DB query if already provided)
      isFirstMessage =
        isFirstMessageParam !== undefined
          ? isFirstMessageParam
          : existingMessages.length === 0;
    }

    // Create user message and set chat status to PROCESSING
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatId: validated.chatId,
        role: "user",
        content: validated.content,
      },
    });

    // Update chat: set status to PROCESSING, clear error, and optionally set title
    const updateData: {
      lastStatus: string;
      lastError: null;
      updatedAt: Date;
      title?: string;
    } = {
      lastStatus: "PROCESSING",
      lastError: null,
      updatedAt: new Date(),
    };

    if (isFirstMessage) {
      updateData.title = validated.content.trim() || "New Chat";
    }

    await prisma.chat.update({
      where: { id: validated.chatId },
      data: updateData,
    });

    // Emit events
    if (isNewChat) {
      chatEvents.emitChatCreated(
        chatUserId,
        validated.chatId,
        updateData.title || null
      );
    }

    // Emit new message event
    chatEvents.emitNewMessage(
      chatUserId,
      validated.chatId,
      userMessage.id,
      "user",
      userMessage.content
    );

    // Emit status change to PROCESSING
    chatEvents.emitStatusChange(
      chatUserId,
      validated.chatId,
      "PROCESSING",
      null
    );

    // Status is now PROCESSING - return immediately so frontend can refresh and show loading icon
    console.log(
      "[createUserMessage] Chat status set to PROCESSING, returning immediately"
    );

    // Trigger async processing using setImmediate (most reliable for Node.js)
    console.log(
      "[createUserMessage] Triggering async processing for chat:",
      validated.chatId
    );
    setImmediate(() => {
      console.log(
        "[createUserMessage] Starting async processing in setImmediate"
      );
      processMessageAsync(validated.chatId).catch((error) => {
        console.error("Failed to process message asynchronously:", error);
      });
    });

    return {
      success: true,
      userMessage,
    };
  } catch (error) {
    console.error("Error in createUserMessage:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to create message",
    };
  }
}

// Generate AI response for the last user message
export async function generateAIResponse(chatId: string) {
  try {
    // Get chat history
    const chatHistory = await getChatMessages(chatId);

    if (chatHistory.length === 0) {
      throw new Error("No messages in chat");
    }

    const lastMessage = chatHistory[chatHistory.length - 1];
    if (lastMessage.role !== "user") {
      throw new Error("Last message is not from user");
    }

    // Generate AI response using tool selection
    const aiResponse = await generateResponse(chatHistory);

    // Create assistant message with metadata
    const assistantMessage = await prisma.chatMessage.create({
      data: {
        chatId: chatId,
        role: "assistant",
        content: aiResponse.content,
        metadata: aiResponse.metadata as Prisma.InputJsonValue,
      },
    });

    // Update chat's updatedAt timestamp
    await prisma.chat.update({
      where: { id: chatId },
      data: { updatedAt: new Date() },
    });

    return {
      success: true,
      assistantMessage,
    };
  } catch (error) {
    console.error("Error in generateAIResponse:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to generate response",
    };
  }
}

// Delete a message
export async function deleteMessage(messageId: string) {
  try {
    await prisma.chatMessage.delete({
      where: { id: messageId },
    });
    return { success: true };
  } catch (error) {
    console.error("Error in deleteMessage:", error);
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Failed to delete message",
    };
  }
}

// Original sendMessage function (for backward compatibility in chat page)
export async function sendMessage(
  chatId: string,
  content: string,
  userId?: string
) {
  const validated = sendMessageSchema.parse({ chatId, content });

  try {
    // Check if chat exists, create it if it doesn't
    let chat = await prisma.chat.findUnique({
      where: { id: validated.chatId },
    });

    if (!chat) {
      if (!userId) {
        throw new Error("Cannot create chat: userId is required");
      }
      // Create the chat lazily on first message
      chat = await prisma.chat.create({
        data: {
          id: validated.chatId,
          userId: userId,
          title: null,
        },
      });
    }

    // Get existing messages to check if this is the first message
    const existingMessages = await getChatMessages(validated.chatId);
    const isFirstMessage = existingMessages.length === 0;

    // Prepare user message (but don't save yet)
    const userMessageData = {
      chatId: validated.chatId,
      role: "user" as const,
      content: validated.content,
    };

    // Get chat history for context (current messages)
    const chatHistory = await getChatMessages(validated.chatId);

    // Add the new user message to history for AI context (temporarily)
    const chatHistoryWithNewMessage = [
      ...chatHistory,
      {
        id: "temp",
        ...userMessageData,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: null,
      },
    ];

    // Generate AI response using tool selection (this might fail)
    const aiResponse = await generateResponse(chatHistoryWithNewMessage);

    // If AI response succeeded, NOW create both messages in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user message
      const userMessage = await tx.chatMessage.create({
        data: userMessageData,
      });

      // Create assistant message with metadata
      const assistantMessage = await tx.chatMessage.create({
        data: {
          chatId: validated.chatId,
          role: "assistant",
          content: aiResponse.content,
          metadata: aiResponse.metadata as Prisma.InputJsonValue,
        },
      });

      // If this is the first message, set it as the chat title
      const title = isFirstMessage
        ? validated.content.trim() || "New Chat"
        : undefined;

      // Update chat's updatedAt timestamp and title if needed
      await tx.chat.update({
        where: { id: validated.chatId },
        data: {
          updatedAt: new Date(),
          ...(title && { title }),
        },
      });

      return { userMessage, assistantMessage };
    });

    return {
      success: true,
      ...result,
    };
  } catch (error) {
    console.error("Error in sendMessage:", error);
    // Return error details to client
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to send message",
    };
  }
}

export async function deleteChat(chatId: string) {
  await prisma.chat.delete({
    where: { id: chatId },
  });
}
