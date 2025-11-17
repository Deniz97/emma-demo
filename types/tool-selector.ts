import { Method } from "./tool";

// DTOs for the ReAct-like loop
export type CodeDto = {
  code: string;
};

export type ThoughtDto = {
  stop: boolean;
  tools?: string[]; // Array of slugs
  reasoning?: string;
};

export type ResultDto = {
  success: boolean;
  output?: any;
  error?: string;
};

export type ExecutionHistoryItem = {
  code: CodeDto;
  thought: ThoughtDto;
  result: ResultDto;
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
  content: string;
  metadata?: Record<string, any>;
};

// ToolSelector result
export type ToolSelectorResult = {
  tools: Method[] | string[]; // Method objects or slugs
  reasoning?: string;
};

// MetaTools context type
export type MetaToolsContext = {
  get_apps: (search_queries: string[], top: number) => Promise<AppDto[]>;
  get_classes: (apps: string[], search_queries: string[], top: number) => Promise<ClassDto[]>;
  get_methods: (apps: string[], classes: string[], search_queries: string[], top: number) => Promise<MethodSummary[]>;
  get_method_details: (apps: string[], classes: string[], method_ids: string[], search_queries: string[], top: number) => Promise<MethodDetail[]>;
  ask_to_method: (method_slug: string, query: string) => Promise<ResponseDto>;
  ask_to_class: (class_slug: string, query: string) => Promise<ResponseDto>;
  ask_to_app: (app_slug: string, query: string) => Promise<ResponseDto>;
};

