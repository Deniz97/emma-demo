"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";

interface ThinkingIndicatorProps {
  processingStep?: string | null;
}

export function ThinkingIndicator({ processingStep }: ThinkingIndicatorProps) {
  console.log(
    "[ThinkingIndicator] Rendering with processingStep:",
    processingStep
  );

  return (
    <div className="flex gap-3 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
      <Avatar className="transition-opacity duration-200">
        <AvatarFallback>AI</AvatarFallback>
      </Avatar>
      <Card className="max-w-[80%] p-4 bg-muted transition-all duration-200">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]"></div>
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]"></div>
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]"></div>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-muted-foreground">Thinking...</span>
            {processingStep && (
              <span className="text-xs text-muted-foreground/70 animate-in fade-in duration-200">
                {processingStep}
              </span>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
