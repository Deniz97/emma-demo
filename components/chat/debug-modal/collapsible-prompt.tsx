"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface CollapsiblePromptProps {
  title: string;
  content: string;
}

export function CollapsiblePrompt({ title, content }: CollapsiblePromptProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 font-medium text-sm mb-2 hover:text-muted-foreground transition-colors"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        {title}
      </button>
      {expanded && (
        <pre className="bg-muted p-3 rounded text-xs overflow-x-auto whitespace-pre-wrap">
          {content}
        </pre>
      )}
    </div>
  );
}
