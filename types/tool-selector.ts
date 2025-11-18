import { Method } from "./tool";

// DTOs for the ReAct-like loop
export type LinesDto = {
  lines: string[];
};

export type ThoughtDto = {
  reasoning?: string;
};

export type ReplOutput = {
  logs: string[];
  lastValue: any;
  error?: string;
  formattedOutput: string;
};

export type ResultDto = {
  success: boolean;
  outputs: ReplOutput[]; // Array of outputs from each line
};

export type ExecutionHistoryItem = {
  lines: LinesDto;
  thought: ThoughtDto;
  result: ResultDto;
  finishMethodSlugs?: string[]; // Present when finish() was called in this step
};

// DTOs for META_TOOLS
export type AppDto = {
  slug: string;
  name: string;
  description?: string | null;
};

export type ClassDto = {
  slug: string;
  name: string;
  description?: string | null;
  appSlug: string;
};

export type MethodSummary = {
  slug: string;
  name: string;
  description?: string | null;
  classSlug: string;
  appSlug: string;
};

export type MethodDetail = {
  slug: string;
  name: string;
  path: string;
  httpVerb: string;
  description?: string | null;
  arguments: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  returnType?: string | null;
  returnDescription?: string | null;
  classSlug: string;
  appSlug: string;
};

export type ResponseDto = {
  yes: boolean;
  no: boolean;
  answer: string;
  metadata?: Record<string, any>;
};

// ToolSelector result
export type ToolSelectorResult = {
  tools: Method[] | string[]; // Method objects or slugs
  reasoning?: string;
  debugData?: {
    systemPrompt: string;
    userPrompt: string;
    executionHistory: Array<{
      step: number;
      lines: string[];
      thought: ThoughtDto;
      result: ResultDto;
      finishMethodSlugs?: string[]; // Present when finish() was called in this step
    }>;
  };
};

// MetaTools context type
export type MetaToolsContext = {
  get_apps: (search_queries: string[], top: number, threshold?: number) => Promise<AppDto[]>;
  get_classes: (apps: string[], search_queries: string[], top: number, threshold?: number) => Promise<ClassDto[]>;
  get_methods: (apps: string[], classes: string[], search_queries: string[], top: number, threshold?: number) => Promise<MethodSummary[]>;
  get_method_details: (apps: string[], classes: string[], method_ids: string[], search_queries: string[], top: number, threshold?: number) => Promise<MethodDetail[]>;
  ask_to_methods: (method_slugs: string[], query: string) => Promise<ResponseDto>;
  ask_to_classes: (class_slugs: string[], query: string) => Promise<ResponseDto>;
  ask_to_apps: (app_slugs: string[], query: string) => Promise<ResponseDto>;
};

