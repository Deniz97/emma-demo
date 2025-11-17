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

export type MessageMetadata = {
  toolSelector?: {
    systemPrompt: string;
    userPrompt: string;
    executionHistory: Array<{
      step: number;
      code: string;
      thought: {
        stop: boolean;
        tools?: string[];
        reasoning?: string;
      };
      result: {
        success: boolean;
        output?: any;
        error?: string;
      };
    }>;
    selectedTools: Array<{
      slug: string;
      name: string;
      description: string | null;
    }>;
  };
  toolExecution?: {
    toolCalls: Array<{
      toolName: string;
      query: string;
      processedResult: string;
    }>;
  };
};

export type ChatMessage = {
  id: string;
  chatId: string;
  role: "user" | "assistant";
  content: string;
  metadata?: MessageMetadata | null;
  createdAt: Date;
};

export type ChatWithMessages = Chat & {
  messages: ChatMessage[];
};

