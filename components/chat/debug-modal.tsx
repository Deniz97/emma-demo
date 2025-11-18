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
  const [executionHistoryExpanded, setExecutionHistoryExpanded] = useState<Record<number, boolean>>({});

  const toggleExecutionHistory = (step: number) => {
    setExecutionHistoryExpanded(prev => ({
      ...prev,
      [step]: !prev[step],
    }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
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
                    <h4 className="font-medium text-sm mb-2">Selected Tools ({metadata.toolSelector.selectedTools.length})</h4>
                    <div className="space-y-2">
                      {metadata.toolSelector.selectedTools.map((tool, idx) => (
                        <div key={idx} className="bg-muted p-3 rounded text-sm">
                          <div className="font-mono text-xs text-muted-foreground">{tool.slug}</div>
                          <div className="font-medium">{tool.name}</div>
                          {tool.description && (
                            <div className="text-xs text-muted-foreground mt-1">{tool.description}</div>
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
                      Execution History ({metadata.toolSelector.executionHistory.length} steps)
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
                                  FINISH ({item.finishMethodSlugs.length} tool{item.finishMethodSlugs.length !== 1 ? 's' : ''})
                                </span>
                              )}
                              {!item.result.success && (
                                <span className="ml-2 text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded">
                                  ERROR
                                </span>
                              )}
                            </span>
                          </button>

                          {executionHistoryExpanded[item.step] && (
                            <div className="p-3 pt-0 space-y-3">
                              {/* Code */}
                              <div>
                                <div className="text-xs font-medium mb-1">Code</div>
                                <pre className="bg-muted p-2 rounded text-xs overflow-x-auto">
                                  {item.lines.join('\n')}
                                </pre>
                              </div>

                              {/* Thought */}
                              <div>
                                <div className="text-xs font-medium mb-1">Thought</div>
                                <div className="bg-muted p-2 rounded text-xs space-y-1">
                                  {item.thought.reasoning && (
                                    <div>
                                      <span className="font-medium">Reasoning:</span> {item.thought.reasoning}
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
                                        <div className="text-green-600 italic">(empty array - conversational query)</div>
                                      )}
                                    </div>
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
                                          {item.result.outputs.map((output, idx) => (
                                            <div key={idx} className="border-l-2 border-muted-foreground/20 pl-2">
                                              <pre className="whitespace-pre-wrap">
                                                {output.formattedOutput}
                                              </pre>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div>
                                      <span className="font-medium text-red-600">Error</span>
                                      <div className="mt-1 text-red-600">{item.result.error}</div>
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
                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Max Iterations</div>
                      <div className="text-lg font-semibold">{metadata.mainLLM.maxIterations}</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Actual Iterations</div>
                      <div className="text-lg font-semibold">{metadata.mainLLM.actualIterations}</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Tool Calls Requested</div>
                      <div className="text-lg font-semibold">{metadata.mainLLM.toolCallsRequested}</div>
                    </div>
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Tool Calls Executed</div>
                      <div className="text-lg font-semibold">{metadata.mainLLM.toolCallsExecuted}</div>
                    </div>
                  </div>

                  {/* Total Execution Time */}
                  {metadata.mainLLM.totalExecutionTimeMs > 0 && (
                    <div className="bg-muted p-3 rounded">
                      <div className="text-xs text-muted-foreground mb-1">Total Execution Time (Parallel)</div>
                      <div className="text-lg font-semibold">{metadata.mainLLM.totalExecutionTimeMs}ms</div>
                    </div>
                  )}

                  {/* Tool Calls Details */}
                  {metadata.mainLLM.toolCalls && metadata.mainLLM.toolCalls.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm mb-2">Tool Calls</h4>
                      <div className="space-y-3">
                        {metadata.mainLLM.toolCalls.map((call, idx: number) => (
                          <div key={idx} className="border rounded p-3 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-medium">{call.toolName}</div>
                              {call.executionTimeMs && (
                                <div className="text-xs text-muted-foreground">
                                  {call.executionTimeMs}ms
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">Query</div>
                              <div className="bg-muted p-2 rounded text-sm">{call.query}</div>
                            </div>
                            <div>
                              <div className="text-xs font-medium text-muted-foreground mb-1">Processed Result</div>
                              <div className="bg-muted p-2 rounded text-sm whitespace-pre-wrap">
                                {call.processedResult}
                              </div>
                            </div>
                          </div>
                        ))}
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

