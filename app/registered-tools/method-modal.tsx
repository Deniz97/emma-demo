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
  classes: Array<{
    id: string;
    name: string;
  }>;
}

interface MethodModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: {
    classId: string;
    name: string;
    path: string;
    httpVerb: string;
    description?: string;
    arguments: Array<{ name: string; type: string; description: string }>;
    returnType?: string;
    returnDescription?: string;
  }) => Promise<void>;
  initialData?: {
    classId?: string;
    name?: string;
    path?: string;
    httpVerb?: string;
    description?: string;
    arguments?: Array<{ name: string; type: string; description: string }>;
    returnType?: string;
    returnDescription?: string;
  };
  apps: App[];
}

const HTTP_VERBS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

export function MethodModal({
  open,
  onOpenChange,
  onSubmit,
  initialData,
  apps,
}: MethodModalProps) {
  const [classId, setClassId] = useState("");
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [httpVerb, setHttpVerb] = useState("GET");
  const [description, setDescription] = useState("");
  const [returnType, setReturnType] = useState("");
  const [returnDescription, setReturnDescription] = useState("");
  const [arguments_, setArguments] = useState<
    Array<{ name: string; type: string; description: string }>
  >([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setClassId(initialData.classId || "");
        setName(initialData.name || "");
        setPath(initialData.path || "");
        setHttpVerb(initialData.httpVerb || "GET");
        setDescription(initialData.description || "");
        setReturnType(initialData.returnType || "");
        setReturnDescription(initialData.returnDescription || "");
        setArguments(initialData.arguments || []);
      } else {
        setClassId("");
        setName("");
        setPath("");
        setHttpVerb("GET");
        setDescription("");
        setReturnType("");
        setReturnDescription("");
        setArguments([]);
      }
    }
  }, [open, initialData]);

  const addArgument = () => {
    setArguments([...arguments_, { name: "", type: "", description: "" }]);
  };

  const removeArgument = (index: number) => {
    setArguments(arguments_.filter((_, i) => i !== index));
  };

  const updateArgument = (
    index: number,
    field: "name" | "type" | "description",
    value: string
  ) => {
    const updated = [...arguments_];
    updated[index] = { ...updated[index], [field]: value };
    setArguments(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId || !name.trim() || !path.trim()) return;

    setIsSubmitting(true);
    try {
      await onSubmit({
        classId,
        name: name.trim(),
        path: path.trim(),
        httpVerb,
        description: description.trim() || undefined,
        arguments: arguments_.filter(
          (arg) => arg.name.trim() && arg.type.trim()
        ),
        returnType: returnType.trim() || undefined,
        returnDescription: returnDescription.trim() || undefined,
      });
    } catch (error) {
      console.error("Failed to submit:", error);
      alert("Failed to save method. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableClasses = apps.flatMap((app) =>
    app.classes.map((cls) => ({ ...cls, appName: app.name }))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {initialData?.name ? "Edit Method" : "Create Method"}
            </DialogTitle>
            <DialogDescription>
              {initialData?.name
                ? "Update the method information."
                : "Create a new API method."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="method-class" className="text-sm font-medium">
                Class *
              </label>
              <select
                id="method-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                required
              >
                <option value="">Select a class</option>
                {availableClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.appName} / {cls.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <label htmlFor="method-name" className="text-sm font-medium">
                  Name *
                </label>
                <Input
                  id="method-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., getPrice"
                  required
                />
              </div>
              <div className="grid gap-2">
                <label htmlFor="method-verb" className="text-sm font-medium">
                  HTTP Verb *
                </label>
                <select
                  id="method-verb"
                  value={httpVerb}
                  onChange={(e) => setHttpVerb(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  required
                >
                  {HTTP_VERBS.map((verb) => (
                    <option key={verb} value={verb}>
                      {verb}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="method-path" className="text-sm font-medium">
                Path *
              </label>
              <Input
                id="method-path"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="e.g., /v1/simple/price"
                required
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="method-description"
                className="text-sm font-medium"
              >
                Description
              </label>
              <Input
                id="method-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Get the current price of any cryptocurrencies"
              />
            </div>
            <div className="grid gap-2">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium">Arguments</label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addArgument}
                >
                  Add Argument
                </Button>
              </div>
              {arguments_.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No arguments. Click &ldquo;Add Argument&ldquo; to add one.
                </p>
              ) : (
                <div className="space-y-2">
                  {arguments_.map((arg, index) => (
                    <div
                      key={index}
                      className="flex gap-2 items-start p-2 border rounded-md"
                    >
                      <Input
                        placeholder="Name"
                        value={arg.name}
                        onChange={(e) =>
                          updateArgument(index, "name", e.target.value)
                        }
                        className="flex-1"
                      />
                      <Input
                        placeholder="Type"
                        value={arg.type}
                        onChange={(e) =>
                          updateArgument(index, "type", e.target.value)
                        }
                        className="flex-1"
                      />
                      <Input
                        placeholder="Description"
                        value={arg.description}
                        onChange={(e) =>
                          updateArgument(index, "description", e.target.value)
                        }
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeArgument(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="method-return-type"
                className="text-sm font-medium"
              >
                Return Type
              </label>
              <Input
                id="method-return-type"
                value={returnType}
                onChange={(e) => setReturnType(e.target.value)}
                placeholder="e.g., PriceData"
              />
            </div>
            <div className="grid gap-2">
              <label
                htmlFor="method-return-description"
                className="text-sm font-medium"
              >
                Return Description
              </label>
              <Input
                id="method-return-description"
                value={returnDescription}
                onChange={(e) => setReturnDescription(e.target.value)}
                placeholder="e.g., Returns price information for the requested cryptocurrencies"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isSubmitting || !classId || !name.trim() || !path.trim()
              }
            >
              {isSubmitting
                ? "Saving..."
                : initialData?.name
                  ? "Update"
                  : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
