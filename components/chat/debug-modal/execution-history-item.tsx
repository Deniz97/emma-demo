"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface ExecutionHistoryItemProps {
  item: {
    step: number;
    lines: string[];
    thought: {
      reasoning?: string;
    };
    finishMethodSlugs?: string[];
    result: {
      success: boolean;
      error?: string;
      outputs?: Array<{
        error?: string;
        formattedOutput?: string;
      }>;
    };
  };
}

export function ExecutionHistoryItem({ item }: ExecutionHistoryItemProps) {
  const [expanded, setExpanded] = useState(false);

  const errorCount = item.result.outputs?.filter((o) => o.error).length || 0;

  return (
    <div className="border rounded">
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
          Step {item.step}
          {item.finishMethodSlugs !== undefined && (
            <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
              FINISH ({item.finishMethodSlugs.length} tool
              {item.finishMethodSlugs.length !== 1 ? "s" : ""})
            </span>
          )}
          {errorCount > 0 ? (
            <span className="ml-2 text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded">
              {errorCount} ERROR{errorCount !== 1 ? "S" : ""}
            </span>
          ) : !item.result.success ? (
            <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
              ERROR
            </span>
          ) : null}
        </span>
      </button>

      {expanded && (
        <div className="p-3 pt-0 space-y-3">
          {/* Code */}
          <div>
            <div className="text-xs font-medium mb-1">Code</div>
            <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
              {item.lines.join("\n")}
            </pre>
          </div>

          {/* Thought */}
          <div>
            <div className="text-xs font-medium mb-1">Thought</div>
            <div className="bg-muted p-2 rounded text-xs space-y-1">
              {item.thought.reasoning && (
                <div>
                  <span className="font-medium">Reasoning:</span>{" "}
                  {item.thought.reasoning}
                </div>
              )}
            </div>
          </div>

          {/* Finish Call */}
          {item.finishMethodSlugs !== undefined && (
            <div>
              <div className="text-xs font-medium mb-1">Finish() Called</div>
              <div className="bg-green-50 border border-green-200 p-2 rounded text-xs">
                <div className="font-medium text-green-800 mb-1">
                  Method Slugs ({item.finishMethodSlugs.length}):
                </div>
                <div className="space-y-1">
                  {item.finishMethodSlugs.length > 0 ? (
                    item.finishMethodSlugs.map((slug, idx) => (
                      <div key={idx} className="font-mono text-green-700">
                        {slug}
                      </div>
                    ))
                  ) : (
                    <div className="text-green-600 italic">
                      (empty array - conversational query)
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Errors Section */}
          {item.result.outputs && item.result.outputs.some((o) => o.error) && (
            <div>
              <div className="text-xs font-bold text-red-600 mb-2">
                ERRORS ({item.result.outputs.filter((o) => o.error).length})
              </div>
              <div className="space-y-2">
                {item.result.outputs.map((output, idx) => {
                  if (!output.error) return null;
                  return (
                    <div
                      key={idx}
                      className="bg-red-50 border-2 border-red-300 p-3 rounded"
                    >
                      <div className="font-bold text-red-800 text-xs mb-1">
                        Error {idx + 1}:
                      </div>
                      <pre className="text-red-700 text-xs whitespace-pre-wrap wrap-break-word font-mono">
                        {output.error}
                      </pre>
                      {output.formattedOutput &&
                        output.formattedOutput !== output.error && (
                          <div className="mt-2">
                            <div className="text-xs font-medium text-red-600 mb-1">
                              Output:
                            </div>
                            <pre className="text-xs whitespace-pre-wrap wrap-break-word bg-red-100 p-2 rounded">
                              {output.formattedOutput}
                            </pre>
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Result */}
          <div>
            <div className="text-xs font-medium mb-1">Result</div>
            <div className="bg-muted p-2 rounded text-xs">
              {item.result.success ? (
                <div>
                  <span className="font-medium text-green-600">Success</span>
                  {item.result.outputs && item.result.outputs.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {item.result.outputs.map((output, idx) => {
                        if (output.error) return null;
                        return (
                          <div
                            key={idx}
                            className="border-l-2 border-muted-foreground/20 pl-2"
                          >
                            <pre className="whitespace-pre-wrap">
                              {output.formattedOutput}
                            </pre>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <span className="font-medium text-red-600">
                    Execution Failed
                  </span>
                  {item.result.error && (
                    <div className="mt-1 text-red-600">{item.result.error}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
