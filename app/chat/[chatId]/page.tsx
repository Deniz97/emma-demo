import { redirect } from "next/navigation";
import { getChatById } from "@/app/actions/chat";
import { ChatPageClient } from "./chat-page-client";

interface ChatPageProps {
  params: Promise<{ chatId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;
  const chat = await getChatById(chatId);

  // Allow the page to render even if chat doesn't exist yet
  // The chat will be created lazily when the first message is sent
  if (!chat) {
    return <ChatPageClient chatId={chatId} initialChat={null} />;
  }

  return <ChatPageClient chatId={chatId} initialChat={chat} />;
}
