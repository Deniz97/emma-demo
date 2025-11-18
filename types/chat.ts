export type Chat = {
  id: string;
  userId: string;
  title: string | null;
  lastStatus?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatListItem = {
  id: string;
  userId: string;
  title: string | null;
  lastStatus?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
  lastMessageAt: Date | null;
};

export type MessageMetadata = {
  toolSelector?: {
    systemPrompt: string;
    userPrompt: string;
    executionHistory: Array<{
      step: number;
      lines: string[];
      thought: {
        stop: boolean;
        tools?: string[];
        reasoning?: string;
      };
      result: {
        success: boolean;
        outputs?: Array<{
          logs: string[];
          lastValue: any;
          error?: string;
          formattedOutput: string;
        }>;
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

