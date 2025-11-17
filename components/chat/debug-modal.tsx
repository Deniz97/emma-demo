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
                              {item.thought.stop && (
                                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded">
                                  STOP
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
                                  {item.code}
                                </pre>
                              </div>

                              {/* Thought */}
                              <div>
                                <div className="text-xs font-medium mb-1">Thought</div>
                                <div className="bg-muted p-2 rounded text-xs space-y-1">
                                  <div>
                                    <span className="font-medium">Stop:</span> {item.thought.stop ? "Yes" : "No"}
                                  </div>
                                  {item.thought.tools && item.thought.tools.length > 0 && (
                                    <div>
                                      <span className="font-medium">Tools:</span> {item.thought.tools.join(", ")}
                                    </div>
                                  )}
                                  {item.thought.reasoning && (
                                    <div>
                                      <span className="font-medium">Reasoning:</span> {item.thought.reasoning}
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Result */}
                              <div>
                                <div className="text-xs font-medium mb-1">Result</div>
                                <div className="bg-muted p-2 rounded text-xs">
                                  {item.result.success ? (
                                    <div>
                                      <span className="font-medium text-green-600">Success</span>
                                      {item.result.output && (
                                        <pre className="mt-1 whitespace-pre-wrap">
                                          {JSON.stringify(item.result.output, null, 2)}
                                        </pre>
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

          {/* Tool Execution Section */}
          {metadata.toolExecution && metadata.toolExecution.toolCalls.length > 0 && (
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
                Tool Execution
              </button>

              {toolExecutionExpanded && (
                <div className="mt-4 space-y-3">
                  {metadata.toolExecution.toolCalls.map((call, idx) => (
                    <div key={idx} className="border rounded p-3 space-y-2">
                      <div className="font-medium">{call.toolName}</div>
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
              )}
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

