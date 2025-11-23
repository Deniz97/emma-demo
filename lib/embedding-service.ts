import { openai } from "./openai-client";
import { EmbeddingConfig } from "@/types/vectors";
import { getModel } from "./model-config";

const DEFAULT_CONFIG: EmbeddingConfig = {
  model: getModel("embedding"),
  dimensions: 1536,
};

/**
 * Generate a single embedding for text using OpenAI
 */
export async function generateEmbedding(
  text: string,
  config: EmbeddingConfig = DEFAULT_CONFIG
): Promise<number[]> {
  if (!text || text.trim().length === 0) {
    throw new Error("Text cannot be empty");
  }

  try {
    const response = await openai.embeddings.create({
      model: config.model,
      input: text,
    });

    const embedding = response.data[0]?.embedding;
    if (!embedding) {
      throw new Error("No embedding returned from OpenAI");
    }

    return embedding;
  } catch (error) {
    console.error("Error generating embedding:", error);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts in batch
 * Handles rate limiting by processing in chunks
 */
export async function generateEmbeddings(
  texts: string[],
  config: EmbeddingConfig = DEFAULT_CONFIG,
  batchSize: number = 100
): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Filter out empty texts and track indices
  const validTexts: { text: string; index: number }[] = [];
  texts.forEach((text, index) => {
    if (text && text.trim().length > 0) {
      validTexts.push({ text, index });
    }
  });

  if (validTexts.length === 0) {
    return texts.map(() => []);
  }

  const embeddings: (number[] | null)[] = new Array(texts.length).fill(null);

  // Process in batches
  for (let i = 0; i < validTexts.length; i += batchSize) {
    const batch = validTexts.slice(i, i + batchSize);
    const batchTexts = batch.map((item) => item.text);

    try {
      const response = await openai.embeddings.create({
        model: config.model,
        input: batchTexts,
      });

      // Map embeddings back to original indices
      response.data.forEach((item, batchIndex) => {
        const originalIndex = batch[batchIndex].index;
        embeddings[originalIndex] = item.embedding;
      });

      // Add small delay to avoid rate limits
      if (i + batchSize < validTexts.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    } catch (error) {
      console.error(
        `Error generating embeddings for batch ${i}-${i + batchSize}:`,
        error
      );
      // Continue with other batches, leaving null for failed ones
    }
  }

  // Convert nulls to empty arrays
  return embeddings.map((emb) => emb || []);
}

/**
 * Convert vector array to pgvector format string
 */
export function vectorToPgVector(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

/**
 * Convert pgvector format string to vector array
 */
export function pgVectorToVector(pgVector: string): number[] {
  // Remove brackets and split by comma
  const cleaned = pgVector.replace(/[\[\]]/g, "");
  return cleaned.split(",").map((val) => parseFloat(val.trim()));
}
