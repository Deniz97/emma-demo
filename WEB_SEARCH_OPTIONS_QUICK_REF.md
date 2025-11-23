# Web Search API Options - Quick Reference

## Top Candidates (Easiest to Hardest)

### 1. **Tavily API** ⭐ EASIEST

- **Why**: Built specifically for AI agents, returns clean JSON with summaries
- **Free Tier**: 1,000 searches/month free
- **Cost**: $0.10 per 1,000 searches after free tier
- **Integration**: Simple REST API, returns pre-summarized results
- **Best For**: Quick implementation, clean data
- **Node.js Package**: `tavily` (official SDK)
- **Example**: `npm install tavily`

### 2. **SerpAPI**

- **Why**: Google search results, reliable, well-documented
- **Free Tier**: 100 searches/month free
- **Cost**: $50/month for 5,000 searches
- **Integration**: REST API, returns structured Google results
- **Best For**: When you need actual Google search results
- **Node.js Package**: `google-search-results` (official)

### 3. **Exa (formerly Metaphor)**

- **Why**: AI-native search, returns semantic results
- **Free Tier**: 1,000 searches/month free
- **Cost**: $0.10 per 1,000 searches after
- **Integration**: REST API with embeddings support
- **Best For**: Semantic search, finding similar content
- **Node.js Package**: `exa-js` (official SDK)

### 4. **Perplexity API**

- **Why**: Returns AI-generated answers with citations
- **Free Tier**: Limited free tier
- **Cost**: Pay-per-use
- **Integration**: REST API, returns natural language answers
- **Best For**: When you want pre-answered questions
- **Node.js Package**: Official SDK available

### 5. **Brave Search API**

- **Why**: Privacy-focused, independent index
- **Free Tier**: 2,000 queries/month free
- **Cost**: $3 per 1,000 queries after
- **Integration**: REST API
- **Best For**: Privacy-conscious, independent results
- **Node.js Package**: Official SDK available

### 6. **Google Custom Search API**

- **Why**: Official Google search
- **Free Tier**: 100 searches/day free
- **Cost**: $5 per 1,000 searches after
- **Integration**: REST API, requires API key + Custom Search Engine ID
- **Best For**: When you need Google's index
- **Node.js Package**: `googleapis` (official)

## Recommended Approach: Tavily

**Why Tavily is easiest:**

1. Returns clean, summarized results (less LLM processing needed)
2. Built for AI agents (handles query optimization)
3. Good free tier (1,000/month)
4. Simple API: one call gets you summaries + sources
5. Official TypeScript SDK

**Basic Integration Pattern:**

```typescript
import { Tavily } from "tavily";

const tavily = new Tavily({ apiKey: process.env.TAVILY_API_KEY });

// Search
const results = await tavily.search(query, {
  searchDepth: "basic", // or "advanced"
  maxResults: 5,
});

// Results include: answer (summary), results (array with content, url, title)
// Then pass to LLM for final synthesis
```

## Alternative: Use OpenAI's Built-in Web Search (if available)

Some OpenAI models support web browsing, but this is typically:

- More expensive (uses more tokens)
- Less control over search parameters
- May not be available in all models

## Implementation Pattern

```
User Query + Tool Description
    ↓
Generate Search Query (LLM or simple concatenation)
    ↓
Call Web Search API
    ↓
Extract Results (summaries + sources)
    ↓
LLM Synthesis (format to match tool's return type)
    ↓
Return Natural Language Answer
```

## Cost Estimate (100-500 searches/day)

- **Tavily**: Free (under 1,000/month) or ~$1.50-$7.50/month
- **SerpAPI**: $50/month (5,000 searches)
- **Exa**: Free (under 1,000/month) or ~$1.50-$7.50/month
- **Brave**: Free (under 2,000/month) or ~$9-$45/month
- **Google Custom**: Free (under 3,000/month) or ~$15-$75/month

## Next Steps

1. Sign up for Tavily API (easiest to start)
2. Test with a few queries
3. Integrate into `executeToolWithLLMWrapper`
4. Fallback to current LLM approach if search fails
