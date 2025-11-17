/**
 * Converts a string to a URL-safe slug
 * @param name - The string to convert to a slug
 * @returns A URL-safe slug (lowercase, hyphens, no special chars)
 */
export function slugify(name: string): string {
  if (!name || name.trim().length === 0) {
    throw new Error("Cannot slugify empty string");
  }

  return name
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, "-")
    // Remove special characters except hyphens
    .replace(/[^a-z0-9-]/g, "")
    // Replace multiple consecutive hyphens with a single hyphen
    .replace(/-+/g, "-")
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, "");
}

