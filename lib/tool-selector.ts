import { openai } from "./openai-client";
import { createReplSession } from "./repl/tools";
import { ReplSession } from "./repl/ReplSession";
import { getModel } from "./model-config";
import {
  LinesDto,
  ThoughtDto,
  ResultDto,
  ExecutionHistoryItem,
  ToolSelectorResult,
} from "@/types/tool-selector";
import { ChatMessage } from "@/types/chat";
import { prisma } from "./prisma";
import type { ChatCompletion } from "openai/resources/chat/completions";

/**
 * Prepares the initial context for the tool selection loop
 */
export async function prepare_initial_context(
  query: string
): Promise<{ systemPrompt: string; firstUserPrompt: string }> {
  // Fetch categories from database
  const categories = await prisma.category.findMany({
    select: {
      slug: true,
      name: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  // Deduplicate by slug (though they should already be unique)
  const uniqueCategories = Array.from(
    new Map(categories.map((cat) => [cat.slug, cat])).values()
  );

  // Format categories list
  const categoriesList = uniqueCategories
    .map((cat) => `\`${cat.slug}\` (${cat.name})`)
    .join(", ");

  // Debug: Log categories
  console.log(
    `[tool-selector] DEBUG - Categories loaded: ${uniqueCategories.length} categories`
  );
  console.log(
    `[tool-selector] DEBUG - Categories list: ${categoriesList.substring(0, 200)}...`
  );

  const systemPrompt = `You are a tool selection assistant. Queries are pre-summarized with conversation context. Select 0-10 relevant tools from 100-200 available.

**Environment**: Persistent Node.js REPL. Use \`var\` for all declarations (never \`const\`/\`let\`). Variables persist across iterations. Full JS capabilities available.

**Categories**: ${categoriesList || "None"}

**META_TOOLS**:
- Search: \`get_apps(dto)\`, \`get_classes(dto)\`, \`get_methods(dto)\`, \`get_method_details(dto)\`
  - DTO: \`{ categories?, apps?, classes?, methods?, search_queries: string[], top: number, threshold?: number }\`
  - Simple: threshold 0.4-0.5, top 1-3. Complex: threshold 0.2-0.3, top 5-10
- Q&A: \`ask_to_apps(slugs[], question)\`, \`ask_to_classes(slugs[], question)\`, \`ask_to_methods(slugs[], question)\` → \`{ yes, no, answer }\`
  - Use these to VERIFY results, check capabilities, filter by features
  - Example: \`await ask_to_methods(methodSlugs, "Can this calculate historical data?")\`
- Completion: \`finish(method_slugs[])\` - MUST call. Empty array OK for conversational queries

**BE CREATIVE & EXPLORATORY**:
- **ALWAYS check result lengths**: \`if (methods.length === 0) { ... }\` - if empty, retry with broader terms
- **Use LOOPS for iterative refinement**: \`for (var i = 0; i < searchTerms.length; i++) { ... }\` or \`while (results.length < 3) { ... }\`
- **Multiple search queries per call**: Use arrays with synonyms: \`search_queries: ["APY", "yield", "interest rate", "farming returns"]\`
- **Iterative fallback strategy**: Start specific, broaden if empty, lower threshold progressively
- Use conditional logic to branch based on results: \`if (apps.length === 0) { ... }\`
- Use ask_to_* tools to verify and filter results intelligently
- Apply regex for pattern matching: \`methods.filter(m => /historical|past|trend/.test(m.name))\`
- Deduplicate with Set: \`var uniqueSlugs = [...new Set([...m1, ...m2].map(x => x.slug))]\`
- Check coverage: Ask if results handle specific aspects of the query
- Combine multiple search strategies: synonyms, broader terms, category filtering
- Use array methods creatively: .filter(), .find(), .some(), .every()
- EXPLORE before deciding: Try different thresholds, check what's available

**Strategy Examples**:
- Multi-concept: Search each separately with MULTIPLE synonyms per search, verify coverage with ask_to_methods, merge unique
- Empty results: Use loops to try progressively broader terms, lower thresholds iteratively
- Iterative refinement: \`var results = []; for (var threshold = 0.4; threshold >= 0.2 && results.length < 5; threshold -= 0.1) { ... }\`
- Multiple queries per search: Always use arrays with 3-5 related terms: \`["APY", "yield", "interest rate", "farming", "returns"]\`
- Verification: \`var check = await ask_to_methods(candidates, "Does this support real-time data?")\`
- Smart filtering: \`var relevant = methods.filter(m => !m.slug.includes('deprecated'))\`
- Greetings/thanks: \`finish([])\` immediately
- Aim to finish in step 1-2 BUT explore thoroughly first with loops and multiple attempts

**CRITICAL FINISH() RULES**:
- **ALWAYS check length before finish()**: \`if (uniqueSlugs.length > 0) { await finish(uniqueSlugs) }\`
- **Step 1 with 0 tools**: NEVER call \`finish([])\` unless it's a conversational query - continue to step 2 instead
- **Step 2+ with 0 tools**: If you've tried everything and still have 0 tools, then call \`finish([])\`
- **Conversational queries only**: \`finish([])\` in step 1 ONLY for greetings/thanks/chitchat
- **Tool selection queries**: If 0 tools found in step 1, DON'T call finish() - let it continue to step 2

**Logging**: Counts/slugs only, not full objects. Log your exploration: "Trying X", "Found Y matching Z"

**Response Format**: Return JSON with this exact structure:
\`\`\`json
{
  "lines": ["code line 1", "code line 2", "await finish([...])"],
  "thought": { "reasoning": "your reasoning here" }
}
\`\`\`

**CRITICAL RULES FOR "lines" ARRAY**:
1. Each string in "lines" MUST be a complete, valid JavaScript statement
2. NEVER include multi-line statements - either put them on one line or split them into separate strings
3. NEVER include non-executable content (comments, metadata, or JSON objects like \`thought: {...}\`)
4. When using arrays, keep the entire array literal in ONE line or split into separate variable assignments
5. The "thought" field is ONLY for the JSON response - it is NOT executable code

**Creative Examples**:

Iterative search with loops and multiple queries (STEP 1 - if tools found):
\`\`\`json
{
  "lines": [
    "var apyQueries = [\\"highest APY\\", \\"yield farming\\", \\"APY yield\\", \\"farming returns\\", \\"interest rate\\"]",
    "var apyMethods = await get_methods({ search_queries: apyQueries, top: 5, threshold: 0.4 })",
    "if (apyMethods.length === 0) { apyMethods = await get_methods({ search_queries: [\\"yield\\", \\"APY\\", \\"farming\\"], top: 5, threshold: 0.3 }) }",
    "if (apyMethods.length === 0) { apyMethods = await get_methods({ search_queries: [\\"returns\\", \\"interest\\"], top: 5, threshold: 0.2 }) }",
    "var oiQueries = [\\"increasing open interest\\", \\"open interest growth\\", \\"OI increase\\", \\"open interest trend\\", \\"OI change\\"]",
    "var oiMethods = await get_methods({ search_queries: oiQueries, top: 5, threshold: 0.4 })",
    "if (oiMethods.length === 0) { oiMethods = await get_methods({ search_queries: [\\"open interest\\", \\"OI\\"], top: 5, threshold: 0.3 }) }",
    "var allMethods = [...apyMethods, ...oiMethods]",
    "var uniqueSlugs = [...new Set(allMethods.map(m => m.slug))]",
    "if (uniqueSlugs.length > 0) { var verified = await ask_to_methods(uniqueSlugs, \\"Can these provide high APY in yield farming and track increasing open interest?\\"); if (verified.yes) { await finish(uniqueSlugs) } else { var filtered = uniqueSlugs.filter(s => /apy|yield|interest|farming|oi/.test(s)); await finish(filtered.length > 0 ? filtered : uniqueSlugs) } }"
  ],
  "thought": { "reasoning": "Search APY and OI with 5 synonyms each, progressive fallback with decreasing thresholds, deduplicate, verify, filter if needed. Only finish if tools found." }
}
\`\`\`
Note: If uniqueSlugs.length === 0 after all attempts, DON'T call finish() - continue to step 2 for different approach!

Loop-based iterative refinement (with length check):
\`\`\`json
{
  "lines": [
    "var results = []",
    "var searchTerms = [\\"bitcoin price\\", \\"BTC price\\", \\"bitcoin market data\\", \\"crypto price\\"]",
    "for (var i = 0; i < searchTerms.length && results.length < 5; i++) { var found = await get_methods({ search_queries: [searchTerms[i]], top: 3, threshold: 0.4 - (i * 0.05) }); if (found.length > 0) { results.push(...found) } }",
    "var uniqueSlugs = [...new Set(results.map(m => m.slug))]",
    "if (uniqueSlugs.length > 0) { var check = await ask_to_methods(uniqueSlugs, \\"Can this provide real-time prices?\\"); var final = check.yes ? uniqueSlugs : uniqueSlugs.filter(s => /real|live|current|price/.test(s)); await finish(final.slice(0, 5)) }"
  ],
  "thought": { "reasoning": "Loop through search terms with decreasing threshold, accumulate results, verify, filter, limit to top 5. Only finish if tools found." }
}
\`\`\`
Note: If uniqueSlugs.length === 0 in step 1, DON'T call finish() - continue to step 2!

Multi-concept with progressive fallback:
\`\`\`json
{
  "lines": [
    "var m1 = await get_methods({ search_queries: [\\"TVL increase\\", \\"TVL growth\\", \\"TVL trend\\", \\"total value locked\\"], top: 5, threshold: 0.3 })",
    "if (m1.length < 3) { var m1b = await get_methods({ search_queries: [\\"TVL\\", \\"value locked\\"], top: 5, threshold: 0.2 }); m1 = [...m1, ...m1b] }",
    "var m2 = await get_methods({ search_queries: [\\"APY growth\\", \\"yield changes\\", \\"interest rate change\\", \\"farming returns\\"], top: 5, threshold: 0.3 })",
    "if (m2.length < 3) { var m2b = await get_methods({ search_queries: [\\"APY\\", \\"yield\\", \\"interest\\"], top: 5, threshold: 0.2 }); m2 = [...m2, ...m2b] }",
    "var combined = [...m1, ...m2]",
    "var uniqueSlugs = [...new Set(combined.map(x => x.slug))]",
    "if (uniqueSlugs.length > 0) { var coverage = await ask_to_methods(uniqueSlugs, \\"Can these track changes over time periods?\\"); if (!coverage.yes && uniqueSlugs.length < 5) { var m3 = await get_methods({ search_queries: [\\"historical\\", \\"trend\\", \\"time series\\"], top: 3, threshold: 0.3 }); uniqueSlugs.push(...m3.map(x => x.slug)) }; await finish([...new Set(uniqueSlugs)].slice(0, 10)) }"
  ],
  "thought": { "reasoning": "Search with multiple synonyms, check length and retry with broader terms if insufficient, verify, add historical if needed, limit to 10. Only finish if tools found." }
}
\`\`\`

When 0 tools found in STEP 1 - DON'T finish, continue to step 2:
\`\`\`json
{
  "lines": [
    "var methods = await get_methods({ search_queries: [\\"rare term\\", \\"obscure feature\\"], top: 5, threshold: 0.4 })",
    "if (methods.length === 0) { methods = await get_methods({ search_queries: [\\"rare\\", \\"obscure\\"], top: 5, threshold: 0.2 }) }",
    "console.log(\\"Step 1: Found\\", methods.length, \\"methods\\")"
  ],
  "thought": { "reasoning": "Step 1 search with fallback. If 0 tools found, don't call finish() - let system continue to step 2 to try different approaches" }
}
\`\`\`

**INVALID Examples** (DO NOT DO THIS):

❌ Syntax error - split array:
\`\`\`json
{
  "lines": [
    "var methods = await get_methods({ search_queries: [\\"price\\"], top: 3 })",
    "await finish([",
    "  ...methods.map(m => m.slug)",
    "])"
  ]
}
\`\`\`

❌ Invalid JavaScript - thought in code:
\`\`\`json
{
  "lines": [
    "var methods = await get_methods({ search_queries: [\\"price\\"], top: 3 })",
    "await finish([methods[0].slug])",
    "thought: { \\"reasoning\\": \\"my reasoning\\" }"
  ]
}
\`\`\`

❌ Finishing with 0 tools in step 1 (non-conversational):
\`\`\`json
{
  "lines": [
    "var methods = await get_methods({ search_queries: [\\"open interest\\", \\"CVD\\"], top: 5, threshold: 0.4 })",
    "if (methods.length === 0) { methods = await get_methods({ search_queries: [\\"OI\\", \\"volume\\"], top: 5, threshold: 0.3 }) }",
    "var uniqueSlugs = [...new Set(methods.map(m => m.slug))]",
    "await finish(uniqueSlugs)"
  ]
}
\`\`\`
Problem: If uniqueSlugs is empty, this finishes with 0 tools in step 1! Should NOT call finish() if length === 0 in step 1 - continue to step 2 instead!

❌ BORING - single query, no length check, no loops, weak verification:
\`\`\`json
{
  "lines": [
    "var apyMethods = await get_methods({ search_queries: [\\"highest APY yield farming\\"], top: 5, threshold: 0.4 })",
    "var oiMethods = await get_methods({ search_queries: [\\"increasing open interest\\"], top: 5, threshold: 0.4 })",
    "var apyUniqueSlugs = apyMethods.map(m => m.slug)",
    "var oiUniqueSlugs = oiMethods.map(m => m.slug)",
    "var combinedSlugs = [...new Set([...apyUniqueSlugs, ...oiUniqueSlugs])]",
    "var verified = await ask_to_methods(combinedSlugs, \\"Can these provide high APY in yield farming and track increasing open interest?\\")",
    "var finalMethods = verified.yes ? combinedSlugs : []",
    "await finish(finalMethods)"
  ]
}
\`\`\`
Problems: Only 1 query per search, no length checks, no retry logic, gives up if verification fails, might finish with 0 tools in step 1!

✅ BETTER - multiple queries, length checks, loops, iterative fallback (STEP 1):
\`\`\`json
{
  "lines": [
    "var apyQueries = [\\"highest APY\\", \\"yield farming\\", \\"APY yield\\", \\"farming returns\\", \\"interest rate\\"]",
    "var apyMethods = await get_methods({ search_queries: apyQueries, top: 5, threshold: 0.4 })",
    "if (apyMethods.length === 0) { apyMethods = await get_methods({ search_queries: [\\"yield\\", \\"APY\\", \\"farming\\"], top: 5, threshold: 0.3 }) }",
    "if (apyMethods.length === 0) { apyMethods = await get_methods({ search_queries: [\\"returns\\", \\"interest\\"], top: 5, threshold: 0.2 }) }",
    "var oiQueries = [\\"increasing open interest\\", \\"open interest growth\\", \\"OI increase\\", \\"open interest trend\\", \\"OI change\\"]",
    "var oiMethods = await get_methods({ search_queries: oiQueries, top: 5, threshold: 0.4 })",
    "if (oiMethods.length === 0) { oiMethods = await get_methods({ search_queries: [\\"open interest\\", \\"OI\\"], top: 5, threshold: 0.3 }) }",
    "var allMethods = [...apyMethods, ...oiMethods]",
    "var uniqueSlugs = [...new Set(allMethods.map(m => m.slug))]",
    "if (uniqueSlugs.length > 0) { var verified = await ask_to_methods(uniqueSlugs, \\"Can these provide high APY in yield farming and track increasing open interest?\\"); if (verified.yes) { await finish(uniqueSlugs) } else { var filtered = uniqueSlugs.filter(s => /apy|yield|interest|farming|oi/.test(s)); await finish(filtered.length > 0 ? filtered : uniqueSlugs) } }"
  ],
  "thought": { "reasoning": "Search with 5 synonyms each, progressive fallback with decreasing thresholds, deduplicate, verify, filter if needed. Only finish if tools found - if 0 tools, continue to step 2" }
}
\`\`\``;

  const firstUserPrompt = `Query (pre-summarized with context): "${query}"

Task:
1. Identify ALL concepts/keywords in the query
2. Write CREATIVE JavaScript code using META_TOOLS to explore and find relevant methods
3. **ALWAYS use MULTIPLE search queries** (3-5 synonyms per search_queries array)
4. **ALWAYS check result lengths** - if empty or too few, retry with broader terms
5. **USE LOOPS** for iterative refinement when needed (for/while)
6. VERIFY results with ask_to_* tools to ensure they match query requirements
7. Use branching, filtering, deduplication as needed
8. **CRITICAL**: Check length before calling finish() - if 0 tools in step 1, DON'T call finish()

THINK LIKE A DETECTIVE WITH PERSISTENCE:
- **Multiple queries per search**: Always use arrays with 3-5 related terms: ["APY", "yield", "interest rate", "farming", "returns"]
- **Check lengths**: \`if (methods.length === 0) { ... }\` - retry with broader terms if empty
- **Iterative loops**: Use for/while to try progressively broader searches or lower thresholds
- **Progressive fallback**: Start specific (threshold 0.4), then broader (0.3), then very broad (0.2)
- Use ask_to_* tools to verify capabilities: "Does this support real-time data?"
- Handle empty results: try synonyms, broaden search, lower threshold, use loops
- Deduplicate with Set when merging multiple searches
- Use regex to filter by patterns in names/descriptions
- Branch based on what you find: if/else for different scenarios
- **Before finish()**: \`if (uniqueSlugs.length > 0) { await finish(uniqueSlugs) }\` - if 0 in step 1, continue to step 2

IMPORTANT: Return a JSON object with TWO fields:
- "lines": An array of JavaScript code strings (each must be a complete, valid statement)
- "thought": An object with "reasoning" field explaining your EXPLORATORY approach

CRITICAL:
- Each element in "lines" must be ONE complete JavaScript statement
- Keep array literals on ONE line or split into multiple variable assignments
- NEVER split arrays across multiple lines in the "lines" array
- NEVER include non-executable content (like \`thought: {...}\`) in the code
- The "thought" field is ONLY in the JSON response, NOT in the executable code

Creative example with loops and multiple queries (STEP 1):
\`\`\`json
{
  "lines": [
    "var btcQueries = [\\"bitcoin price\\", \\"BTC price\\", \\"bitcoin market data\\", \\"crypto price\\", \\"BTC value\\"]",
    "var m1 = await get_methods({ search_queries: btcQueries, top: 5, threshold: 0.4 })",
    "if (m1.length === 0) { m1 = await get_methods({ search_queries: [\\"bitcoin\\", \\"BTC\\", \\"crypto\\"], top: 5, threshold: 0.3 }) }",
    "if (m1.length === 0) { m1 = await get_methods({ search_queries: [\\"price\\", \\"market\\"], top: 5, threshold: 0.2 }) }",
    "var priceQueries = [\\"price data\\", \\"market data\\", \\"price information\\", \\"market price\\", \\"current price\\"]",
    "var m2 = await get_methods({ search_queries: priceQueries, top: 5, threshold: 0.4 })",
    "if (m2.length === 0) { m2 = await get_methods({ search_queries: [\\"price\\", \\"market\\"], top: 5, threshold: 0.3 }) }",
    "var combined = [...m1, ...m2]",
    "var uniqueSlugs = [...new Set(combined.map(x => x.slug))]",
    "if (uniqueSlugs.length > 0) { var hasRealtime = await ask_to_methods(uniqueSlugs, \\"Can these provide real-time or current prices?\\"); var final = hasRealtime.yes ? uniqueSlugs.slice(0, 5) : uniqueSlugs.filter(s => /real|live|current|price/.test(s)); await finish(final.length > 0 ? final : uniqueSlugs) }"
  ],
  "thought": { "reasoning": "Search with 5 synonyms each, progressive fallback, merge & deduplicate, verify real-time, filter if needed. Only finish if tools found - if 0 tools, continue to step 2" }
}
\`\`\``;

  // Debug: Log the prompts
  console.log(
    `[tool-selector] DEBUG - System prompt length: ${systemPrompt.length} chars`
  );
  console.log(
    `[tool-selector] DEBUG - System prompt (first 500 chars):\n${systemPrompt.substring(0, 500)}`
  );
  console.log(`[tool-selector] DEBUG - First user prompt:\n${firstUserPrompt}`);

  return { systemPrompt, firstUserPrompt };
}

/**
 * Generates the next code lines and thought using OpenAI
 */
export async function generate_next_script(
  systemPrompt: string,
  firstUserPrompt: string,
  executionHistory: ExecutionHistoryItem[],
  currentStep: number,
  maxSteps: number
): Promise<{ lines: LinesDto; thought: ThoughtDto }> {
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [
    { role: "system", content: systemPrompt },
    { role: "user", content: firstUserPrompt },
  ];

  // Add execution history as context
  // No truncation limits - let the LLM decide what to output based on prompts and guidelines
  for (const item of executionHistory) {
    // Format the REPL outputs (no truncation - trust LLM's smart logging)
    const replOutputs = item.result.outputs
      .map((output) => {
        let formatted = output.formattedOutput;

        // Remove code echo lines (lines starting with '>', '...', or echoed code)
        const lines = formatted.split("\n");
        const resultLines = lines.filter((line) => {
          const trimmed = line.trim();
          // Skip empty lines
          if (!trimmed) return false;
          // Skip REPL prompt lines (starting with '>' or '...')
          if (trimmed.startsWith(">") || trimmed.startsWith("..."))
            return false;
          // Skip standalone "undefined"
          if (trimmed === "undefined") return false;
          // Keep error lines
          if (trimmed.includes("Error") || trimmed.includes("Uncaught"))
            return true;
          // Keep everything else (console.log output, return values)
          return true;
        });
        formatted = resultLines.join("\n").trim();

        // If empty after filtering, use a summary instead
        if (!formatted || formatted === "undefined") {
          formatted = "(No output)";
        }

        // No truncation - let the LLM control output through smart logging guidelines
        return formatted;
      })
      .filter((output) => output && output !== "(No output)") // Remove empty outputs
      .join("\n\n");

    // No truncation limit - trust the LLM to be selective based on guidelines
    const finalReplOutputs = replOutputs || "(No output)";

    messages.push({
      role: "assistant",
      content: `Lines executed:
${item.lines.lines.map((line, idx) => `${idx + 1}. ${line}`).join("\n")}

Thought: ${JSON.stringify(item.thought)}

REPL Output:
${finalReplOutputs}`,
    });
    messages.push({
      role: "user",
      content:
        "Review the previous result. ANALYZE what you found:\n\n1. **Check result lengths**: Did you get enough results? If methods.length === 0 or too few, RETRY with broader terms and lower threshold\n2. **Use LOOPS if needed**: Iterate through search terms or thresholds if results are insufficient\n3. **Multiple queries**: Did you use 3-5 synonyms per search_queries array? If not, expand your search terms\n4. Are ALL concepts/keywords from the query covered?\n5. Use ask_to_methods to VERIFY the results handle the query requirements\n6. If results seem off-target, try different search terms or synonyms with loops\n7. If any concept is missing, branch (if/else) and search for it specifically with multiple queries\n8. Use filtering/deduplication to clean up results\n9. **CRITICAL**: Before calling finish(), check length! If you have 0 tools and this is step 1, DON'T call finish() - continue to step 2 to try different approaches\n10. If comprehensive coverage is achieved AND you have tools (length > 0), call finish() now\n\nBe CREATIVE: Use loops for iteration, check lengths, use multiple queries (3-5 synonyms), conditionals, regex filtering, ask_to_* verification, and smart JavaScript patterns.\n\n**Length check before finish()**: \`if (uniqueSlugs.length > 0) { await finish(uniqueSlugs) }\` - if 0 in step 1, don't call finish()",
    });
  }

  // On the last step, add a special instruction to make final decision
  if (currentStep === maxSteps) {
    messages.push({
      role: "user",
      content:
        "⚠️ CRITICAL: This is your FINAL step (step 3 of 3). You MUST call finish() with your final method slugs array now. Review all the information you've gathered, ensure comprehensive coverage of the query, and call finish(method_slugs) with your complete tool selection.",
    });
  }

  // Calculate approximate token count (rough estimate: 1 token ≈ 4 chars)
  // Note: GPT-5 models may use reasoning tokens, so actual usage may be higher
  const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
  const estimatedTokens = Math.ceil(totalChars / 4);

  console.log(
    `[tool-selector] Calling OpenAI for iteration ${executionHistory.length + 1}...`
  );
  console.log(
    `[tool-selector] Context size: ~${estimatedTokens} tokens (${totalChars} chars, ${messages.length} messages)`
  );

  // Debug: Log the full messages being sent (truncated for readability)
  console.log(`[tool-selector] DEBUG - Messages being sent to LLM:`);
  messages.forEach((msg, idx) => {
    const preview = msg.content.substring(0, 300);
    console.log(
      `[tool-selector]   Message ${idx + 1} (${msg.role}): ${preview}${msg.content.length > 300 ? "..." : ""}`
    );
  });

  // No hard limits - just informational logging
  // Trust the LLM to manage context through smart logging guidelines

  try {
    const model = getModel("toolSelector");
    console.log(`[tool-selector] DEBUG - Calling model: ${model}`);
    console.log(`[tool-selector] DEBUG - Using response_format: json_object`);

    const response = await openai.chat.completions.create(
      {
        model,
        messages,
        response_format: { type: "json_object" },
      },
      {
        // GPT-5 models may use reasoning tokens which can take longer
        // Increased timeout to accommodate reasoning and large contexts
        timeout: 180000, // 180 second timeout (3 minutes) - increased for GPT-5 reasoning tokens
      }
    );

    console.log(`[tool-selector] OpenAI response received`);
    console.log(
      `[tool-selector] DEBUG - Response choice count: ${response.choices.length}`
    );
    console.log(
      `[tool-selector] DEBUG - Finish reason: ${response.choices[0]?.finish_reason}`
    );
    console.log(`[tool-selector] DEBUG - Usage:`, response.usage);

    return parseOpenAIResponse(response);
  } catch (error) {
    console.error(
      `[tool-selector] OpenAI call failed:`,
      error instanceof Error ? error.message : String(error)
    );
    console.error(`[tool-selector] Full error:`, error);
    // Return empty lines - the loop will continue or hit max steps
    return {
      lines: { lines: [] },
      thought: {
        reasoning: `OpenAI call failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      },
    };
  }
}

/**
 * Parse OpenAI response into lines and thought
 */
function parseOpenAIResponse(response: ChatCompletion): {
  lines: LinesDto;
  thought: ThoughtDto;
} {
  const content = response.choices[0]?.message?.content;
  if (!content) {
    console.error("[tool-selector] No content in OpenAI response");
    return {
      lines: { lines: [] },
      thought: { reasoning: "No response from OpenAI" },
    };
  }

  // Debug: Log the raw response content
  console.log(
    "[tool-selector] Raw LLM response content:",
    content.substring(0, 1000)
  );

  try {
    const parsed = JSON.parse(content);

    // Debug: Log the parsed structure
    console.log(
      "[tool-selector] Parsed JSON structure:",
      JSON.stringify({
        hasLines: !!parsed.lines,
        linesType: Array.isArray(parsed.lines) ? "array" : typeof parsed.lines,
        linesCount: Array.isArray(parsed.lines) ? parsed.lines.length : 0,
        hasThought: !!parsed.thought,
        thoughtKeys: parsed.thought ? Object.keys(parsed.thought) : [],
      })
    );

    const lines: LinesDto = {
      lines: Array.isArray(parsed.lines) ? parsed.lines : [],
    };
    const thought: ThoughtDto = {
      reasoning: parsed.thought?.reasoning || undefined,
    };

    // Debug: Log what we're returning
    console.log(
      "[tool-selector] Parsed result: lines =",
      lines.lines.length,
      "thought =",
      thought.reasoning?.substring(0, 100)
    );

    // Debug: If lines is empty, check if there was any code-like content in the response
    if (lines.lines.length === 0) {
      console.warn(
        "[tool-selector] ⚠️  WARNING: LLM returned 0 lines of code!"
      );
      console.warn("[tool-selector] ⚠️  Thought reasoning:", thought.reasoning);
      console.warn(
        "[tool-selector] ⚠️  This suggests the LLM is not generating executable code."
      );

      // Check if the parsed object has any other fields that might contain code
      const otherKeys = Object.keys(parsed).filter(
        (k) => k !== "lines" && k !== "thought"
      );
      if (otherKeys.length > 0) {
        console.warn("[tool-selector] ⚠️  Other keys in response:", otherKeys);
        otherKeys.forEach((key) => {
          console.warn(
            `[tool-selector] ⚠️  ${key}:`,
            JSON.stringify(parsed[key]).substring(0, 200)
          );
        });
      }
    }

    return { lines, thought };
  } catch (error) {
    console.error("[tool-selector] Failed to parse OpenAI response:", error);
    console.error(
      "[tool-selector] Response content:",
      content.substring(0, 500)
    );
    return {
      lines: { lines: [] },
      thought: { reasoning: "Failed to parse OpenAI response" },
    };
  }
}

/**
 * Executes code lines in the REPL session
 */
async function executeLines(
  session: ReplSession,
  lines: string[]
): Promise<ResultDto> {
  try {
    const outputs = await session.runLines(lines);

    // Log detailed error information
    const errors = outputs.filter((o) => o.error);
    if (errors.length > 0) {
      console.error(`[tool-selector] ${errors.length} error(s) in execution:`);
      errors.forEach((output, idx) => {
        console.error(`[tool-selector] Error ${idx + 1}:`, output.error);
        if (output.formattedOutput) {
          console.error(
            `[tool-selector] Error ${idx + 1} output:`,
            output.formattedOutput
          );
        }
      });
    }

    return {
      success: true,
      outputs,
    };
  } catch (error) {
    console.error(
      "[tool-selector] Execution failed:",
      error instanceof Error ? error.message : String(error)
    );
    return {
      success: false,
      outputs: [],
    };
  }
}

/**
 * Main function that implements the iterative tool selection loop
 */
export async function selectTools(
  query: string,
  chatHistory: ChatMessage[],
  maxSteps: number = 3,
  onStepChange?: (step: string) => Promise<void>
): Promise<ToolSelectorResult> {
  console.log(
    `[tool-selector] Starting tool selection for query: "${query.substring(0, 60)}${query.length > 60 ? "..." : ""}"`
  );

  // Step 1: Analyzing query
  if (onStepChange) {
    await onStepChange("Analyzing query...");
  }

  const { systemPrompt, firstUserPrompt } =
    await prepare_initial_context(query);

  const session = createReplSession();
  const executionHistory: ExecutionHistoryItem[] = [];
  let step = 0;

  while (step < maxSteps) {
    step++;
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Generating exploration code...`
    );

    // Step 2: Selecting tools (generating code)
    if (onStepChange) {
      await onStepChange(`Selecting Tools ${step}/${maxSteps}`);
    }

    // Generate next lines and thought
    const { lines, thought } = await generate_next_script(
      systemPrompt,
      firstUserPrompt,
      executionHistory,
      step,
      maxSteps
    );

    // Debug: Log the thought/reasoning for this step
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Thought/reasoning:`,
      thought.reasoning || "(none)"
    );

    // Step 3: Exploring tools (executing code)
    if (onStepChange && lines.lines.length > 0) {
      await onStepChange("Exploring tools...");
    }

    // Check if finish() was already called (before running new lines)
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Checking for early termination...`
    );
    let finishResult = session.getFinishResult();
    if (finishResult !== null) {
      console.log(
        `[tool-selector] ✓ Tool selection complete: finish() was called in previous step with ${finishResult.length} tool(s)`
      );

      // Don't execute new lines, just return with existing finish result
      const methods =
        finishResult.length > 0
          ? await prisma.method.findMany({
              where: {
                slug: {
                  in: finishResult,
                },
              },
              include: {
                class: {
                  include: {
                    app: true,
                  },
                },
              },
            })
          : [];

      return {
        tools: methods.map((m) => ({
          id: m.id,
          classId: m.classId,
          name: m.name,
          path: m.path,
          httpVerb: m.httpVerb,
          description: m.description,
          arguments: m.arguments as Array<{
            name: string;
            type: string;
            description: string;
          }>,
          returnType: m.returnType,
          returnDescription: m.returnDescription,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        reasoning:
          executionHistory[executionHistory.length - 1]?.thought?.reasoning,
        debugData: {
          systemPrompt,
          userPrompt: firstUserPrompt,
          executionHistory: executionHistory.map((item, idx) => ({
            step: idx + 1,
            lines: item.lines.lines,
            thought: item.thought,
            result: item.result,
            finishMethodSlugs: item.finishMethodSlugs,
          })),
        },
      };
    }

    // Execute the lines in the persistent REPL session
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Executing ${lines.lines.length} line(s) of code...`
    );
    console.log(`[tool-selector] Step ${step}/${maxSteps}: Code to execute:`);
    lines.lines.forEach((line, idx) => {
      console.log(`  ${idx + 1}: ${line}`);
    });

    const result = await executeLines(session, lines.lines);

    // Wait a bit for IPC messages to be processed (finish() uses IPC, not stdout)
    // This ensures finish() calls are detected before we check the result
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Check if finish() was called during this execution
    finishResult = session.getFinishResult();
    console.log(
      `[tool-selector] Step ${step}/${maxSteps}: Checking finish result:`,
      finishResult
    );
    if (finishResult !== null) {
      const toolSlugs = finishResult;
      console.log(
        `[tool-selector] ✓ Tool selection complete: finish() called with ${toolSlugs.length} tool(s) in ${step} step(s)`
      );

      // Add the final step to execution history
      const finalStepHistory = [
        ...executionHistory,
        {
          lines,
          thought,
          result,
          finishMethodSlugs: toolSlugs,
        },
      ];

      // Fetch Method objects by slugs (if any)
      const methods =
        toolSlugs.length > 0
          ? await prisma.method.findMany({
              where: {
                slug: {
                  in: toolSlugs,
                },
              },
              include: {
                class: {
                  include: {
                    app: true,
                  },
                },
              },
            })
          : [];

      return {
        tools: methods.map((m) => ({
          id: m.id,
          classId: m.classId,
          name: m.name,
          path: m.path,
          httpVerb: m.httpVerb,
          description: m.description,
          arguments: m.arguments as Array<{
            name: string;
            type: string;
            description: string;
          }>,
          returnType: m.returnType,
          returnDescription: m.returnDescription,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
        })),
        reasoning: thought.reasoning,
        debugData: {
          systemPrompt,
          userPrompt: firstUserPrompt,
          executionHistory: finalStepHistory.map((item, idx) => ({
            step: idx + 1,
            lines: item.lines.lines,
            thought: item.thought,
            result: item.result,
            finishMethodSlugs: item.finishMethodSlugs,
          })),
        },
      };
    }

    if (result.success) {
      const errorCount = result.outputs.filter((o) => o.error).length;
      if (errorCount > 0) {
        console.error(
          `[tool-selector] Step ${step}/${maxSteps}: ⚠ ${errorCount} error(s) during execution`
        );
        // Log each error with details
        result.outputs.forEach((output, idx) => {
          if (output.error) {
            console.error(
              `[tool-selector] Step ${step}/${maxSteps} - Error ${idx + 1}:`,
              output.error
            );
          }
        });
      } else {
        console.log(
          `[tool-selector] Step ${step}/${maxSteps}: ✓ Execution complete`
        );
      }
    } else {
      console.error(
        `[tool-selector] Step ${step}/${maxSteps}: ✗ Execution failed`
      );
    }

    // Append to execution history
    executionHistory.push({
      lines,
      thought,
      result,
    });
  }

  // If we've exhausted max steps, return empty result
  console.log(`[tool-selector] Max steps reached without finding tools`);

  return {
    tools: [],
    reasoning: "Max steps reached without finding tools",
    debugData: {
      systemPrompt,
      userPrompt: firstUserPrompt,
      executionHistory: executionHistory.map((item, idx) => ({
        step: idx + 1,
        lines: item.lines.lines,
        thought: item.thought,
        result: item.result,
      })),
    },
  };
}
