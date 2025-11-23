/**
 * Parse JSON from LLM response, handling common issues like markdown code blocks,
 * trailing commas, and comments
 */
export function parseJsonResponse(content: string): unknown {
  // Remove markdown code blocks
  let jsonContent = content.trim();

  // Remove markdown code fences
  jsonContent = jsonContent
    .replace(/^```(?:json)?\n?/gm, "")
    .replace(/```$/gm, "")
    .trim();

  // Try to extract JSON array/object from text if it's embedded
  const jsonMatch = jsonContent.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    jsonContent = jsonMatch[0];
  }

  // Remove trailing commas before closing brackets/braces
  jsonContent = jsonContent.replace(/,(\s*[}\]])/g, "$1");

  // Remove comments (single-line and multi-line)
  jsonContent = jsonContent
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");

  try {
    return JSON.parse(jsonContent);
  } catch (error) {
    // Log the problematic content for debugging
    console.error(
      "Failed to parse JSON. Content:",
      jsonContent.substring(0, 500)
    );
    throw error;
  }
}
