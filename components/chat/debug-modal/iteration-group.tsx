"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { ToolCallItem } from "./tool-call-item";
import type { ChatCompletionMessageToolCall } from "openai/resources/chat/completions";

interface IterationGroupProps {
  iteration: number;
  calls: Array<{
    call: {
      toolName: string;
      query: string;
      processedResult: string;
      executionTimeMs?: number;
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
    };
    originalIdx: number;
  }>;
}

export function IterationGroup({ iteration, calls }: IterationGroupProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded">
      {/* Iteration Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <span className="font-medium text-sm">
          Iteration {iteration}
          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
            {calls.length} tool{calls.length !== 1 ? "s" : ""}
          </span>
        </span>
      </button>

      {/* Iteration Content */}
      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {calls.map(({ call, originalIdx }) => (
            <ToolCallItem key={originalIdx} call={call} />
          ))}
        </div>
      )}
    </div>
  );
}
