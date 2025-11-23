import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Delay execution for a specified number of milliseconds
 * Useful for rate limiting API calls
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map category slugs to icons
 * Categories are slugified: "Market Data & Aggregators" -> "market-data-aggregators"
 */
export function getCategoryIcon(
  categories: Array<{ slug: string; name: string }>
): string {
  if (categories.length === 0) return "💡";

  // Take the first category for icon selection
  const slug = categories[0].slug.toLowerCase();

  // Map categories to relevant crypto/finance icons
  // Based on actual categories from mock_apps.txt:

  // 1. Market Data & Aggregators -> "market-data-aggregators"
  if (slug.includes("market-data") || slug.includes("aggregator")) return "📈";

  // 2. On-Chain Analytics -> "on-chain-analytics"
  if (slug.includes("on-chain")) return "🔗";

  // 3. DeFi Analytics -> "defi-analytics"
  if (slug.includes("defi")) return "🏦";

  // 4. Trading & Derivatives Platforms -> "trading-derivatives-platforms"
  if (slug.includes("trading") || slug.includes("derivatives")) return "📊";

  // 5. DEX + AMM Data Sources -> "dex-amm-data-sources"
  if (slug.includes("dex") || slug.includes("amm")) return "🔄";

  // 6. NFT + Social + Sentiment -> "nft-social-sentiment"
  if (slug.includes("nft") && slug.includes("social")) return "🎭";
  if (slug.includes("nft")) return "🎨";
  if (slug.includes("social") || slug.includes("sentiment")) return "💬";

  // 7. News & Research -> "news-research"
  if (slug.includes("news") || slug.includes("research")) return "📰";

  // Additional common categories
  if (slug.includes("analytics") || slug.includes("data")) return "📊";
  if (slug.includes("exchange")) return "💱";
  if (slug.includes("wallet")) return "👛";
  if (slug.includes("lending")) return "💰";
  if (slug.includes("marketplace")) return "🛍️";
  if (slug.includes("price") || slug.includes("market")) return "💹";
  if (slug.includes("bridge") || slug.includes("cross-chain")) return "🌉";
  if (slug.includes("staking") || slug.includes("yield")) return "🌱";
  if (slug.includes("dao") || slug.includes("governance")) return "🗳️";
  if (slug.includes("insurance")) return "🛡️";
  if (slug.includes("oracle")) return "🔮";

  // Default icon
  return "💡";
}
