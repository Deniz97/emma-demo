import { redirect } from "next/navigation";
import { getChatById } from "@/app/actions/chat";
import { ChatPageClient } from "./chat-page-client";

interface ChatPageProps {
  params: Promise<{ chatId: string }>;
}

export default async function ChatPage({ params }: ChatPageProps) {
  const { chatId } = await params;
  const chat = await getChatById(chatId);

  if (!chat) {
    redirect("/");
  }

  return <ChatPageClient chatId={chatId} initialChat={chat} />;
}
