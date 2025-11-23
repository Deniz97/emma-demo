"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ToolCallItemProps {
  call: {
    toolName: string;
    query?: string;
    processedResult?: string;
    executionTimeMs?: number;
    rawToolCall?: unknown;
    tavilyData?: {
      queries: string[];
      requests: unknown[];
      responses: Array<unknown | null>;
    };
  };
  index: number;
}

export function ToolCallItem({ call }: ToolCallItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [tavilyExpanded, setTavilyExpanded] = useState(false);

  return (
    <div className="border rounded">
      {/* Tool Call Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full p-3 text-left hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          <span className="font-medium text-sm">{call.toolName}</span>
        </div>
        {call.executionTimeMs && (
          <div className="text-xs text-muted-foreground">
            {call.executionTimeMs}ms
          </div>
        )}
      </button>

      {/* Tool Call Details */}
      {expanded && (
        <div className="p-3 pt-0 space-y-2">
          {/* Natural Language Query (Input) */}
          <div>
            <div className="text-xs font-medium mb-1">
              📥 Natural Language Query (INPUT)
            </div>
            <div className="bg-muted p-3 rounded text-sm">
              {call.query || (
                <span className="text-red-600 italic">⚠️ No query found</span>
              )}
            </div>
          </div>

          {/* Natural Language Response (Output) */}
          <div>
            <div className="text-xs font-medium mb-1">
              📤 Natural Language Response (OUTPUT)
            </div>
            <div className="bg-muted p-3 rounded text-sm whitespace-pre-wrap">
              {call.processedResult || (
                <span className="text-red-600 italic">
                  ⚠️ No response found
                </span>
              )}
            </div>
          </div>

          {/* Raw Tool Call */}
          {call.rawToolCall && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                🔧 Raw Tool Call (Debug Only - Not Actually Executed)
              </div>
              <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                {JSON.stringify(call.rawToolCall, null, 2)}
              </pre>
            </div>
          )}

          {/* Tavily Web Search Request/Response */}
          {call.tavilyData && (
            <div>
              <button
                onClick={() => setTavilyExpanded(!tavilyExpanded)}
                className="flex items-center gap-2 text-xs font-medium mb-1 hover:text-muted-foreground transition-colors"
              >
                {tavilyExpanded ? (
                  <ChevronDown className="h-3 w-3" />
                ) : (
                  <ChevronRight className="h-3 w-3" />
                )}
                🔍 Tavily Web Search ({call.tavilyData.queries.length}{" "}
                {call.tavilyData.queries.length === 1 ? "query" : "queries"})
              </button>
              {tavilyExpanded && (
                <div className="space-y-2">
                  {/* Search Queries */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      Search Queries ({call.tavilyData.queries.length})
                    </div>
                    <div className="bg-muted p-2 rounded text-xs">
                      {call.tavilyData.queries.map((q, idx) => (
                        <div key={idx} className="mb-1">
                          {idx + 1}. {q}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Requests */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      📤 Tavily Requests
                    </div>
                    <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(call.tavilyData.requests, null, 2)}
                    </pre>
                  </div>

                  {/* Responses */}
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">
                      📥 Tavily Responses (
                      {
                        call.tavilyData.responses.filter((r) => r !== null)
                          .length
                      }{" "}
                      successful)
                    </div>
                    <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap max-h-96 overflow-y-auto">
                      {JSON.stringify(call.tavilyData.responses, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
