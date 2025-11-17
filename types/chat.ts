export type Chat = {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatListItem = Chat & {
  messageCount: number;
  lastMessageAt: Date | null;
};

export type ChatMessage = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

export type ChatWithMessages = Chat & {
  messages: ChatMessage[];
};

