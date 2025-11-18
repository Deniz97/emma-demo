"use server";

import { prisma } from "@/lib/prisma";
import { generateResponse } from "@/lib/chat-service";
import { z } from "zod";

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

  return chat;
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
    messages: chat.messages.map((msg) => ({
      ...msg,
      role: msg.role as "user" | "assistant",
      metadata: msg.metadata as any,
    })),
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
    metadata: msg.metadata as any,
  }));
}

// Create user message only (optimistic update)
export async function createUserMessage(chatId: string, content: string, userId?: string) {
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

    // Create user message
    const userMessage = await prisma.chatMessage.create({
      data: {
        chatId: validated.chatId,
        role: "user",
        content: validated.content,
      },
    });

    // If this is the first message, set it as the chat title (truncated to 50 chars)
    if (isFirstMessage) {
      const title = validated.content.slice(0, 50).trim() || "New Chat";
      await prisma.chat.update({
        where: { id: validated.chatId },
        data: { title },
      });
    }

    return {
      success: true,
      userMessage,
    };
  } catch (error) {
    console.error("Error in createUserMessage:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create message",
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
        metadata: aiResponse.metadata as any,
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
      error: error instanceof Error ? error.message : "Failed to generate response",
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
      error: error instanceof Error ? error.message : "Failed to delete message",
    };
  }
}

// Original sendMessage function (for backward compatibility in chat page)
export async function sendMessage(chatId: string, content: string, userId?: string) {
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
          metadata: aiResponse.metadata as any,
        },
      });

      // If this is the first message, set it as the chat title (truncated to 50 chars)
      const title = isFirstMessage
        ? validated.content.slice(0, 50).trim() || "New Chat"
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

