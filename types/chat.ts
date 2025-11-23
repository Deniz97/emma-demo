export type Chat = {
  id: string;
  userId: string;
  title: string | null;
  lastStatus?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
  lastError?: string | null;
  processingStep?: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ChatListItem = {
  id: string;
  userId: string;
  title: string | null;
  lastStatus?: "PROCESSING" | "SUCCESS" | "FAIL" | null;
  lastError?: string | null;
  processingStep?: string | null;
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
        reasoning?: string;
      };
      result: {
        success: boolean;
        outputs?: Array<{
          logs: string[];
          lastValue: unknown;
          error?: string;
          formattedOutput: string;
        }>;
        error?: string;
      };
      finishMethodSlugs?: string[]; // Present when finish() was called in this step
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
  mainLLM?: {
    systemPrompt: string;
    userPrompt: string;
    maxIterations: number;
    actualIterations: number;
    toolCallsRequested: number;
    toolCallsExecuted: number;
    totalExecutionTimeMs: number;
    toolCalls: Array<{
      toolName: string;
      query: string;
      processedResult: string;
      executionTimeMs?: number;
      iteration: number;
      rawToolCall?: import("openai/resources/chat/completions").ChatCompletionMessageToolCall; // Raw OpenAI tool call object
      tavilyData?: {
        queries: string[];
        requests: Array<{
          query: string;
          options: {
            maxResults: number;
            searchDepth: "basic" | "advanced";
            includeAnswer: boolean;
          };
        }>;
        responses: Array<{
          answer?: string;
          results: Array<{
            title: string;
            url: string;
            content: string;
            score: string;
            rawContent?: string;
          }>;
          query: string;
        } | null>;
      };
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
