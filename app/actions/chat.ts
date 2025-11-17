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
  }));
}

export async function sendMessage(chatId: string, content: string, userId?: string) {
  const validated = sendMessageSchema.parse({ chatId, content });

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
  const title = isFirstMessage
    ? validated.content.slice(0, 50).trim() || "New Chat"
    : undefined;

  // Get chat history for context
  const chatHistory = await getChatMessages(validated.chatId);

  // Generate AI response using tool selection
  const aiResponse = await generateResponse(chatHistory);

  // Create assistant message
  const assistantMessage = await prisma.chatMessage.create({
    data: {
      chatId: validated.chatId,
      role: "assistant",
      content: aiResponse,
    },
  });

  // Update chat's updatedAt timestamp and title if needed
  await prisma.chat.update({
    where: { id: validated.chatId },
    data: {
      updatedAt: new Date(),
      ...(title && { title }),
    },
  });

  return {
    userMessage,
    assistantMessage,
  };
}

export async function deleteChat(chatId: string) {
  await prisma.chat.delete({
    where: { id: chatId },
  });
}

