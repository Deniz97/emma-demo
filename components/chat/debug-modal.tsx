"use client";

import { useState } from "react";
import { MessageMetadata } from "@/types/chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";

interface DebugModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: MessageMetadata;
}

export function DebugModal({ open, onOpenChange, metadata }: DebugModalProps) {
  const [toolSelectorExpanded, setToolSelectorExpanded] = useState(true);
  const [toolExecutionExpanded, setToolExecutionExpanded] = useState(true);
  const [executionHistoryExpanded, setExecutionHistoryExpanded] = useState<
    Record<number, boolean>
  >({});

  const toggleExecutionHistory = (step: number) => {
    setExecutionHistoryExpanded((prev) => ({
      ...prev,
      [step]: !prev[step],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[99vw]! w-[99vw]! sm:max-w-[99vw]! max-h-[95vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Debug Information</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tool Selector Section */}
          {metadata.toolSelector && (
            <Card className="p-4">
              <button
                onClick={() => setToolSelectorExpanded(!toolSelectorExpanded)}
                className="flex items-center gap-2 font-semibold text-lg w-full text-left"
              >
                {toolSelectorExpanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
                Tool Selector
              </button>

              {toolSelectorExpanded && (
                <div className="mt-4 space-y-4">
                  {/* Selected Tools */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      Selected Tools (
                      {metadata.toolSelector.selectedTools.length})
                    </h4>
                    <div className="space-y-2">
                      {metadata.toolSelector.selectedTools.map((tool, idx) => (
                        <div key={idx} className="bg-muted p-3 rounded text-sm">
                          <div className="font-mono text-xs text-muted-foreground">
                            {tool.slug}
                          </div>
                          <div className="font-medium">{tool.name}</div>
                          {tool.description && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {tool.description}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* System Prompt */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">System Prompt</h4>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                      {metadata.toolSelector.systemPrompt}
                    </pre>
                  </div>

                  {/* User Prompt */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">User Prompt</h4>
                    <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                      {metadata.toolSelector.userPrompt}
                    </pre>
                  </div>

                  {/* Execution History */}
                  <div>
                    <h4 className="font-medium text-sm mb-2">
                      Execution History (
                      {metadata.toolSelector.executionHistory.length} steps)
                    </h4>
                    <div className="space-y-2">
                      {metadata.toolSelector.executionHistory.map((item) => (
                        <div key={item.step} className="border rounded">
                          <button
                            onClick={() => toggleExecutionHistory(item.step)}
                            className="flex items-center gap-2 w-full p-3 text-left hover:bg-muted/50 transition-colors"
                          >
                            {executionHistoryExpanded[item.step] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                            <span className="font-medium text-sm">
                              Step {item.step}
                              {item.finishMethodSlugs !== undefined && (
                                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                  FINISH ({item.finishMethodSlugs.length} tool
                                  {item.finishMethodSlugs.length !== 1
                                    ? "s"
                                    : ""}
                                  )
                                </span>
                              )}
                              {(() => {
                                const errorCount =
                                  item.result.outputs?.filter((o) => o.error)
                                    .length || 0;
                                if (errorCount > 0) {
                                  return (
                                    <span className="ml-2 text-xs bg-red-500 text-white font-bold px-2 py-0.5 rounded">
                                      {errorCount} ERROR
                                      {errorCount !== 1 ? "S" : ""}
                                    </span>
                                  );
                                }
                                if (!item.result.success) {
                                  return (
                                    <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                      ERROR
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                            </span>
                          </button>

                          {executionHistoryExpanded[item.step] && (
                            <div className="p-3 pt-0 space-y-3">
                              {/* Code */}
                              <div>
                                <div className="text-xs font-medium mb-1">
                                  Code
                                </div>
                                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                                  {item.lines.join("\n")}
                                </pre>
                              </div>

                              {/* Thought */}
                              <div>
                                <div className="text-xs font-medium mb-1">
                                  Thought
                                </div>
                                <div className="bg-muted p-2 rounded text-xs space-y-1">
                                  {item.thought.reasoning && (
                                    <div>
                                      <span className="font-medium">
                                        Reasoning:
                                      </span>{" "}
                                      {item.thought.reasoning}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Finish Call */}
                              {item.finishMethodSlugs !== undefined && (
                                <div>
                                  <div className="text-xs font-medium mb-1">
                                    Finish() Called
                                  </div>
                                  <div className="bg-green-50 border border-green-200 p-2 rounded text-xs">
                                    <div className="font-medium text-green-800 mb-1">
                                      Method Slugs (
                                      {item.finishMethodSlugs.length}):
                                    </div>
                                    <div className="space-y-1">
                                      {item.finishMethodSlugs.length > 0 ? (
                                        item.finishMethodSlugs.map(
                                          (slug, idx) => (
                                            <div
                                              key={idx}
                                              className="font-mono text-green-700"
                                            >
                                              {slug}
                                            </div>
                                          )
                                        )
                                      ) : (
                                        <div className="text-green-600 italic">
                                          (empty array - conversational query)
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}

                              {/* Errors Section - Show prominently */}
                              {item.result.outputs &&
                                item.result.outputs.some((o) => o.error) && (
                                  <div>
                                    <div className="text-xs font-bold text-red-600 mb-2">
                                      ERRORS (
                                      {
                                        item.result.outputs.filter(
                                          (o) => o.error
                                        ).length
                                      }
                                      )
                                    </div>
                                    <div className="space-y-2">
                                      {item.result.outputs.map(
                                        (output, idx) => {
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
                                                output.formattedOutput !==
                                                  output.error && (
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
                                        }
                                      )}
                                    </div>
                                  </div>
                                )}

                              {/* Result */}
                              <div>
                                <div className="text-xs font-medium mb-1">
                                  Result
                                </div>
                                <div className="bg-muted p-2 rounded text-xs">
                                  {item.result.success ? (
                                    <div>
                                      <span className="font-medium text-green-600">
                                        Success
                                      </span>
                                      {item.result.outputs &&
                                        item.result.outputs.length > 0 && (
                                          <div className="mt-2 space-y-2">
                                            {item.result.outputs.map(
                                              (output, idx) => {
                                                // Skip error outputs - they're shown above
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
                                              }
                                            )}
                                          </div>
                                        )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="font-medium text-red-600">
                                        Execution Failed
                                      </span>
                                      {item.result.error && (
                                        <div className="mt-1 text-red-600">
                                          {item.result.error}
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Main LLM Tool Execution Section */}
          {metadata.mainLLM && (
            <Card className="p-4">
              <button
                onClick={() => setToolExecutionExpanded(!toolExecutionExpanded)}
                className="flex items-center gap-2 font-semibold text-lg w-full text-left"
              >
                {toolExecutionExpanded ? (
                  <ChevronDown className="h-5 w-5" />
                ) : (
                  <ChevronRight className="h-5 w-5" />
                )}
                Main LLM Tool Execution
              </button>

              {toolExecutionExpanded && (
                <div className="mt-4 space-y-4">
                  {/* System Prompt */}
                  {metadata.mainLLM.systemPrompt && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">
                        System Prompt
                      </h4>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                        {metadata.mainLLM.systemPrompt}
                      </pre>
                    </div>
                  )}

                  {/* User Prompt */}
                  {metadata.mainLLM.userPrompt && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">User Prompt</h4>
                      <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                        {metadata.mainLLM.userPrompt}
                      </pre>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        Max Iterations
                      </div>
                      <div className="text-lg font-semibold">
                        {metadata.mainLLM.maxIterations}
                      </div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        Actual Iterations
                      </div>
                      <div className="text-lg font-semibold">
                        {metadata.mainLLM.actualIterations}
                      </div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        Tool Calls Requested
                      </div>
                      <div className="text-lg font-semibold">
                        {metadata.mainLLM.toolCallsRequested}
                      </div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        Tool Calls Executed
                      </div>
                      <div className="text-lg font-semibold">
                        {metadata.mainLLM.toolCallsExecuted}
                      </div>
                    </div>
                  </div>

                  {/* Total Execution Time */}
                  {metadata.mainLLM.totalExecutionTimeMs > 0 && (
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">
                        Total Execution Time (Parallel)
                      </div>
                      <div className="text-lg font-semibold">
                        {metadata.mainLLM.totalExecutionTimeMs}ms
                      </div>
                    </div>
                  )}

                  {/* Tool Calls Details */}
                  {metadata.mainLLM.toolCalls &&
                    metadata.mainLLM.toolCalls.length > 0 && (
                      <div>
                        <h4 className="font-medium text-sm mb-2">
                          Tool Calls ({metadata.mainLLM.toolCalls.length})
                        </h4>
                        <div className="space-y-3">
                          {metadata.mainLLM.toolCalls.map(
                            (call, idx: number) => (
                              <div
                                key={idx}
                                className="border rounded p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <div className="font-medium">
                                    {call.toolName}
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      (Iteration {call.iteration})
                                    </span>
                                  </div>
                                  {call.executionTimeMs && (
                                    <div className="text-xs text-muted-foreground">
                                      {call.executionTimeMs}ms
                                    </div>
                                  )}
                                </div>
                                {/* Natural Language Query (Input) */}
                                <div>
                                  <div className="text-xs font-medium mb-1">
                                    📥 Natural Language Query (INPUT)
                                  </div>
                                  <div className="bg-muted p-3 rounded text-sm">
                                    {call.query || (
                                      <span className="text-red-600 italic">
                                        ⚠️ No query found
                                      </span>
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

                                {/* Raw Tool Call (for debugging only - not actually used) */}
                                {call.rawToolCall && (
                                  <div>
                                    <div className="text-xs font-medium text-muted-foreground mb-1">
                                      🔧 Raw Tool Call (Debug Only - Not
                                      Actually Executed)
                                    </div>
                                    <pre className="bg-muted p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap">
                                      {JSON.stringify(
                                        call.rawToolCall,
                                        null,
                                        2
                                      )}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
