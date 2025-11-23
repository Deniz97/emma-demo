/**
 * Centralized model configuration for the application
 *
 * Two tiers:
 * - "fast": Cheaper, faster models for high-volume tasks
 * - "normal": More capable models for complex reasoning
 *
 * Model families supported:
 * - GPT-3.5: Fast, cheap, 16k context
 * - GPT-4o: Balanced, 128k context, structured outputs
 * - GPT-4o-mini: Cheaper GPT-4o variant, 128k context
 * - GPT-5: Slower, reasoning tokens (currently avoided due to performance)
 */

export type ModelTier = "fast" | "normal" | "cheap";

export type ModelFamily = "gpt-3.5" | "gpt-4o" | "gpt-4o-mini" | "gpt-5";

export interface ModelConfig {
  /** Main chat model for user conversations and tool orchestration */
  chat: string;

  /** Tool selector model for ReAct loop and tool filtering */
  toolSelector: string;

  /** Tool wrapper model for processing tool results */
  toolWrapper: string;

  /** Query summarizer model for condensing user queries */
  querySummarizer: string;

  /** META_TOOLS LLM model for Q&A about tools */
  metaTools: string;

  /** Metadata service model for generating descriptions */
  metadata: string;

  /** Embedding model for vector search */
  embedding: string;

  /** Seed/utility script model for one-off tasks */
  utility: string;
}

/**
 * Model family specifications
 */
export interface ModelFamilySpec {
  /** Context window size in tokens */
  contextWindow: number;

  /** Maximum output tokens (completion) */
  maxOutputTokens: number;

  /** Supports structured JSON output mode */
  supportsJsonMode: boolean;

  /** Supports reasoning tokens (slower) */
  hasReasoningTokens: boolean;

  /** Recommended max tokens for typical use */
  recommendedMaxTokens: number;

  /** Temperature default */
  defaultTemperature: number;
}

/**
 * Model family specifications
 */
const MODEL_FAMILY_SPECS: Record<ModelFamily, ModelFamilySpec> = {
  "gpt-3.5": {
    contextWindow: 16385,
    maxOutputTokens: 4096,
    supportsJsonMode: true,
    hasReasoningTokens: false,
    recommendedMaxTokens: 2048,
    defaultTemperature: 0.7,
  },
  "gpt-4o": {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
    hasReasoningTokens: false,
    recommendedMaxTokens: 4096,
    defaultTemperature: 0.7,
  },
  "gpt-4o-mini": {
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsJsonMode: true,
    hasReasoningTokens: false,
    recommendedMaxTokens: 4096,
    defaultTemperature: 0.7,
  },
  "gpt-5": {
    contextWindow: 200000,
    maxOutputTokens: 100000,
    supportsJsonMode: true,
    hasReasoningTokens: true,
    recommendedMaxTokens: 8192,
    defaultTemperature: 1.0, // GPT-5 uses temperature=1 by default
  },
};

const MODEL_CONFIGS: Record<ModelTier, ModelConfig> = {
  cheap: {
    chat: "gpt-5-nano-2025-08-07",
    toolSelector: "gpt-5-nano-2025-08-07",
    toolWrapper: "gpt-5-nano-2025-08-07",
    querySummarizer: "gpt-5-nano-2025-08-07",
    metaTools: "gpt-5-nano-2025-08-07",
    metadata: "gpt-5-nano-2025-08-07",
    embedding: "text-embedding-3-small",
    utility: "gpt-5-nano-2025-08-07",
  },
  fast: {
    chat: "gpt-3.5-turbo",
    toolSelector: "gpt-3.5-turbo",
    toolWrapper: "gpt-3.5-turbo",
    querySummarizer: "gpt-3.5-turbo",
    metaTools: "gpt-3.5-turbo",
    metadata: "gpt-3.5-turbo",
    embedding: "text-embedding-3-small",
    utility: "gpt-3.5-turbo",
  },
  normal: {
    chat: "gpt-4o",
    toolSelector: "gpt-4.1-nano",
    toolWrapper: "gpt-4o-mini",
    querySummarizer: "gpt-4.1-nano",
    metaTools: "gpt-4.1-nano",
    metadata: "gpt-4o-mini",
    embedding: "text-embedding-3-small",
    utility: "gpt-4o-mini",
  },
};

/**
 * Current model tier
 * Change this to switch between fast and normal models globally
 */
const CURRENT_TIER: ModelTier = "fast";

/**
 * Get the model configuration for the current tier
 */
export function getModelConfig(): ModelConfig {
  return MODEL_CONFIGS[CURRENT_TIER];
}

/**
 * Get a specific model by purpose
 */
export function getModel(purpose: keyof ModelConfig): string {
  return getModelConfig()[purpose];
}

/**
 * Get the current tier
 */
export function getCurrentTier(): ModelTier {
  return CURRENT_TIER;
}

/**
 * Detect model family from model name
 */
export function getModelFamily(modelName: string): ModelFamily {
  if (modelName.includes("gpt-5")) return "gpt-5";
  if (modelName.includes("gpt-4o-mini")) return "gpt-4o-mini";
  if (modelName.includes("gpt-4o")) return "gpt-4o";
  if (modelName.includes("gpt-3.5")) return "gpt-3.5";

  // Default fallback
  return "gpt-4o";
}

/**
 * Get model family specifications for a model
 */
export function getModelSpec(modelName: string): ModelFamilySpec {
  const family = getModelFamily(modelName);
  return MODEL_FAMILY_SPECS[family];
}

/**
 * Get model specifications by purpose (uses current tier)
 */
export function getModelSpecByPurpose(
  purpose: keyof ModelConfig
): ModelFamilySpec {
  const modelName = getModel(purpose);
  return getModelSpec(modelName);
}

/**
 * Model API parameters - use this for OpenAI API calls
 * Automatically sets appropriate parameters based on model family
 */
export interface ModelApiParams {
  model: string;
  max_tokens?: number;
  temperature?: number;
}

/**
 * Get recommended API parameters for a model purpose
 *
 * @param purpose - The model purpose (chat, toolSelector, etc.)
 * @param options - Override options
 * @returns API parameters ready to use with OpenAI SDK
 *
 * @example
 * ```typescript
 * const response = await openai.chat.completions.create({
 *   ...getModelParams("chat"),
 *   messages: [...],
 * });
 * ```
 */
export function getModelParams(
  purpose: keyof ModelConfig,
  options?: {
    maxTokens?: number;
    temperature?: number;
    useRecommendedMaxTokens?: boolean;
  }
): ModelApiParams {
  const modelName = getModel(purpose);
  const spec = getModelSpec(modelName);

  const params: ModelApiParams = {
    model: modelName,
  };

  // Set max_tokens if requested or if using recommended
  if (options?.maxTokens) {
    params.max_tokens = options.maxTokens;
  } else if (options?.useRecommendedMaxTokens) {
    params.max_tokens = spec.recommendedMaxTokens;
  }

  // Set temperature (use override, or default from spec)
  params.temperature = options?.temperature ?? spec.defaultTemperature;

  return params;
}

/**
 * Check if a model supports JSON mode
 */
export function supportsJsonMode(modelName: string): boolean {
  return getModelSpec(modelName).supportsJsonMode;
}

/**
 * Check if a model uses reasoning tokens (and is thus slower)
 */
export function hasReasoningTokens(modelName: string): boolean {
  return getModelSpec(modelName).hasReasoningTokens;
}
