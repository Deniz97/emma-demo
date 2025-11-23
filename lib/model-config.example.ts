/**
 * Example usage of the model configuration system
 * 
 * This file demonstrates how to use the model config with automatic
 * parameter handling for different model families.
 */

import { openai } from "./openai-client";
import {
  getModelParams,
  getModel,
  getModelSpec,
  supportsJsonMode,
  hasReasoningTokens,
} from "./model-config";

/**
 * Example 1: Simple usage with automatic parameters
 */
async function exampleBasicUsage() {
  // The old way (manual)
  const oldResponse = await openai.chat.completions.create({
    model: "gpt-4o", // hardcoded
    temperature: 0.7, // manual
    max_tokens: 4000, // manual - needs to change for different models!
    messages: [{ role: "user", content: "Hello" }],
  });

  // The new way (automatic) - recommended!
  const newResponse = await openai.chat.completions.create({
    ...getModelParams("chat"), // automatically sets model, temperature, max_tokens
    messages: [{ role: "user", content: "Hello" }],
  });
}

/**
 * Example 2: With custom overrides
 */
async function exampleWithOverrides() {
  const response = await openai.chat.completions.create({
    ...getModelParams("toolSelector", {
      temperature: 0.3, // override default
      maxTokens: 2000, // custom max tokens
    }),
    messages: [{ role: "user", content: "Select tools" }],
  });
}

/**
 * Example 3: Using recommended max tokens
 */
async function exampleRecommendedTokens() {
  // Automatically uses the recommended max_tokens for the model family
  // GPT-3.5: 2048, GPT-4o: 4096, GPT-5: 8192
  const response = await openai.chat.completions.create({
    ...getModelParams("chat", { useRecommendedMaxTokens: true }),
    messages: [{ role: "user", content: "Long response needed" }],
  });
}

/**
 * Example 4: Checking model capabilities
 */
async function exampleCheckCapabilities() {
  const model = getModel("chat");

  if (supportsJsonMode(model)) {
    // Safe to use JSON mode
    const response = await openai.chat.completions.create({
      ...getModelParams("chat"),
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return valid JSON with a 'result' field",
        },
        { role: "user", content: "Generate data" },
      ],
    });
  }

  if (hasReasoningTokens(model)) {
    console.warn("Using GPT-5 family - expect slower responses");
  }
}

/**
 * Example 5: Getting model specifications
 */
function exampleModelSpecs() {
  const spec = getModelSpec("gpt-4o");

  console.log(`Context window: ${spec.contextWindow} tokens`);
  console.log(`Max output: ${spec.maxOutputTokens} tokens`);
  console.log(`Recommended max: ${spec.recommendedMaxTokens} tokens`);
  console.log(`Supports JSON: ${spec.supportsJsonMode}`);
  console.log(`Has reasoning tokens: ${spec.hasReasoningTokens}`);
  console.log(`Default temperature: ${spec.defaultTemperature}`);
}

/**
 * Example 6: Real-world usage with logging
 */
async function exampleRealWorld() {
  const model = getModel("toolWrapper");
  const spec = getModelSpec(model);

  console.log(`[tool-wrapper] Using model: ${model}`);
  console.log(`[tool-wrapper] Context: ${spec.contextWindow} tokens`);

  const response = await openai.chat.completions.create({
    ...getModelParams("toolWrapper", {
      temperature: 0.7,
      useRecommendedMaxTokens: true,
    }),
    messages: [
      { role: "system", content: "You are a helpful assistant" },
      { role: "user", content: "Process this tool result..." },
    ],
  });

  console.log(`[tool-wrapper] Response: ${response.choices[0]?.message?.content?.substring(0, 100)}...`);
}

/**
 * Example 7: Conditional logic based on model family
 */
async function exampleConditionalLogic() {
  const model = getModel("chat");
  const spec = getModelSpec(model);

  // Adjust batch size based on model capabilities
  const batchSize = spec.contextWindow > 100000 ? 50 : 20;

  // Adjust timeout based on reasoning tokens
  const timeout = hasReasoningTokens(model) ? 60000 : 30000;

  console.log(`Using batch size: ${batchSize}, timeout: ${timeout}ms`);
}

