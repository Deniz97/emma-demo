"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown, ChevronRight } from "lucide-react";
import { CollapsiblePrompt } from "./collapsible-prompt";
import { ExecutionHistoryItem } from "./execution-history-item";

interface ToolSelectorSectionProps {
  toolSelector: {
    systemPrompt: string;
    userPrompt: string;
    selectedTools: Array<{
      slug: string;
      name: string;
      description?: string | null;
    }>;
    executionHistory: Array<{
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
    }>;
  };
}

export function ToolSelectorSection({
  toolSelector,
}: ToolSelectorSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedToolsExpanded, setSelectedToolsExpanded] = useState(false);

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
        Tool Selector
      </button>

      {expanded && (
        <div className="mt-4 space-y-4">
          {/* Selected Tools */}
          <div>
            <button
              onClick={() => setSelectedToolsExpanded(!selectedToolsExpanded)}
              className="flex items-center gap-2 font-medium text-sm mb-2 hover:text-muted-foreground transition-colors"
            >
              {selectedToolsExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              Selected Tools ({toolSelector.selectedTools.length})
            </button>
            {selectedToolsExpanded && (
              <div className="space-y-2">
                {toolSelector.selectedTools.map((tool, idx) => (
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
            )}
          </div>

          {/* System Prompt */}
          <CollapsiblePrompt
            title="System Prompt"
            content={toolSelector.systemPrompt}
          />

          {/* User Prompt */}
          <CollapsiblePrompt
            title="User Prompt"
            content={toolSelector.userPrompt}
          />

          {/* Execution History */}
          <div>
            <h4 className="font-medium text-sm mb-2">
              Execution History ({toolSelector.executionHistory.length} steps)
            </h4>
            <div className="space-y-2">
              {toolSelector.executionHistory.map((item) => (
                <ExecutionHistoryItem key={item.step} item={item} />
              ))}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
