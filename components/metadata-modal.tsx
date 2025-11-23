"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface MetadataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  metadata: Record<string, string> | null;
  error?: string | null;
  loading?: boolean;
}

export function MetadataModal({
  open,
  onOpenChange,
  title,
  metadata,
  error,
  loading,
}: MetadataModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title} - Metadata</DialogTitle>
          <DialogDescription>
            LLM-generated metadata for this entity
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="py-8 text-center text-muted-foreground">
            Loading metadata...
          </div>
        )}

        {error && (
          <div className="py-8">
            <Card className="border-destructive">
              <CardContent className="pt-6">
                <p className="text-sm text-destructive">{error}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {metadata && !loading && (
          <div className="py-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Metadata Fields</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(metadata).map(([key, value]) => (
                    <div
                      key={key}
                      className="border-b last:border-0 pb-4 last:pb-0"
                    >
                      <div className="text-sm font-semibold text-muted-foreground mb-1">
                        {key}
                      </div>
                      <div className="text-sm">
                        {value || (
                          <span className="text-muted-foreground italic">
                            No value
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {!metadata && !error && !loading && (
          <div className="py-8 text-center text-muted-foreground">
            No metadata available. Run vector population to generate metadata.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
