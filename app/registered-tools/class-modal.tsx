"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface App {
  id: string;
  name: string;
}

interface ClassModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: { appId: string; name: string; description?: string }) => Promise<void>;
  initialData?: { appId?: string; name?: string; description?: string };
  apps: App[];
}

export function ClassModal({ open, onOpenChange, onSubmit, initialData, apps }: ClassModalProps) {
  const [appId, setAppId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setAppId(initialData.appId || "");
        setName(initialData.name || "");
        setDescription(initialData.description || "");
      } else {
        setAppId("");
        setName("");
        setDescription("");
      }
    }
  }, [open, initialData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        appId,
        name: name.trim(),
        description: description.trim() || undefined,
      });
    } catch (error) {
      console.error("Failed to submit:", error);
      alert("Failed to save class. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{initialData?.name ? "Edit Class" : "Create Class"}</DialogTitle>
            <DialogDescription>
              {initialData?.name ? "Update the class information." : "Create a new class to group related API methods."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="class-app" className="text-sm font-medium">
                App *
              </label>
              <select
                id="class-app"
                value={appId}
                onChange={(e) => setAppId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              >
                <option value="">Select an app</option>
                {apps.map((app) => (
                  <option key={app.id} value={app.id}>
                    {app.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <label htmlFor="class-name" className="text-sm font-medium">
                Name *
              </label>
              <Input
                id="class-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Prices"
                required
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="class-description" className="text-sm font-medium">
                Description
              </label>
              <Input
                id="class-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Methods for fetching price data"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !appId || !name.trim()}>
              {isSubmitting ? "Saving..." : initialData?.name ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

