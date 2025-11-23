"use client";

import { MessageMetadata } from "@/types/chat";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToolSelectorSection } from "./tool-selector-section";
import { MainLLMSection } from "./main-llm-section";

interface DebugModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metadata: MessageMetadata;
}

export function DebugModal({ open, onOpenChange, metadata }: DebugModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[99vw]! w-[99vw]! sm:max-w-[99vw]! h-[95vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Debug Information</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto flex-1">
          {/* Tool Selector Section */}
          {metadata.toolSelector && (
            <ToolSelectorSection toolSelector={metadata.toolSelector} />
          )}

          {/* Main LLM Tool Execution Section */}
          {metadata.mainLLM && <MainLLMSection mainLLM={metadata.mainLLM} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
