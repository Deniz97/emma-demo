"use client";

import { useState, useMemo } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CollapsiblePrompt } from "./collapsible-prompt";
import { IterationGroup } from "./iteration-group";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

interface MainLLMSectionProps {
  mainLLM: {
    systemPrompt?: string;
    userPrompt?: string;
    maxIterations: number;
    actualIterations: number;
    toolCallsRequested: number;
    toolCallsExecuted: number;
    totalExecutionTimeMs: number;
    toolCalls: Array<{
      toolName: string;
      query: string;
      processedResult: string;
      executionTimeMs?: number;
      iteration: number;
      rawToolCall?: ChatCompletionMessageToolCall;
      tavilyData?: {
        queries: string[];
        requests: Array<{
          query: string;
          options: {
            maxResults: number;
            searchDepth: "basic" | "advanced";
            includeAnswer: boolean;
          };
        }>;
        responses: Array<{
          answer?: string;
          results: Array<{
            title: string;
            url: string;
            content: string;
            score: string;
            rawContent?: string;
          }>;
          query: string;
        } | null>;
      };
    }>;
  };
}

export function MainLLMSection({ mainLLM }: MainLLMSectionProps) {
  const [expanded, setExpanded] = useState(false);

  // Group tool calls by iteration
  const iterationGroups = useMemo(() => {
    const groups = mainLLM.toolCalls.reduce(
      (acc, call, idx) => {
        const iter = call.iteration;
        if (!acc[iter]) acc[iter] = [];
        acc[iter].push({ call, originalIdx: idx });
        return acc;
      },
      {} as Record<
        number,
        Array<{
          call: (typeof mainLLM.toolCalls)[0];
          originalIdx: number;
        }>
      >
    );

    return Object.entries(groups).sort(([a], [b]) => Number(a) - Number(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mainLLM.toolCalls]);

  return (
    <Card className="p-4">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 font-semibold text-lg w-full text-left"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5" />
        ) : (
          <ChevronRight className="h-5 w-5" />
        )}
        Main LLM Tool Execution
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* System Prompt */}
          {mainLLM.systemPrompt && (
            <CollapsiblePrompt
              title="System Prompt"
              content={mainLLM.systemPrompt}
            />
          )}

          {/* User Prompt */}
          {mainLLM.userPrompt && (
            <CollapsiblePrompt
              title="User Prompt"
              content={mainLLM.userPrompt}
            />
          )}

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-muted p-3 rounded">
              <div className="text-xs text-muted-foreground mb-1">
                Max Iterations
              </div>
              <div className="text-lg font-semibold">
                {mainLLM.maxIterations}
              </div>
            </div>
            <div className="bg-muted p-3 rounded">
              <div className="text-xs text-muted-foreground mb-1">
                Actual Iterations
              </div>
              <div className="text-lg font-semibold">
                {mainLLM.actualIterations}
              </div>
            </div>
            <div className="bg-muted p-3 rounded">
              <div className="text-xs text-muted-foreground mb-1">
                Tool Calls Requested
              </div>
              <div className="text-lg font-semibold">
                {mainLLM.toolCallsRequested}
              </div>
            </div>
            <div className="bg-muted p-3 rounded">
              <div className="text-xs text-muted-foreground mb-1">
                Tool Calls Executed
              </div>
              <div className="text-lg font-semibold">
                {mainLLM.toolCallsExecuted}
              </div>
            </div>
          </div>

          {/* Total Execution Time */}
          {mainLLM.totalExecutionTimeMs > 0 && (
            <div className="bg-muted p-3 rounded">
              <div className="text-xs text-muted-foreground mb-1">
                Total Execution Time (Parallel)
              </div>
              <div className="text-lg font-semibold">
                {mainLLM.totalExecutionTimeMs}ms
              </div>
            </div>
          )}

          {/* Tool Calls Details - Grouped by Iteration */}
          {mainLLM.toolCalls && mainLLM.toolCalls.length > 0 && (
            <div>
              <h4 className="font-medium text-sm mb-2">
                Tool Calls ({mainLLM.toolCalls.length} total)
              </h4>
              <div className="space-y-2">
                {iterationGroups.map(([iteration, calls]) => (
                  <IterationGroup
                    key={iteration}
                    iteration={Number(iteration)}
                    calls={calls}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
