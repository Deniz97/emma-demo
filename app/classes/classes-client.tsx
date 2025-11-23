"use client";

import { useState, useTransition, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  createClass,
  updateClass,
  deleteClass,
  getAllApps,
} from "@/app/actions/tools";
import { getClassMetadata } from "@/app/actions/vectors";
import { ClassModal } from "../registered-tools/class-modal";
import { MetadataModal } from "@/components/metadata-modal";
import { Pagination } from "@/components/pagination";

type App = {
  id: string;
  name: string;
  classes: Array<{
    id: string;
    name: string;
    description: string | null;
    methods: Array<{ id: string }>;
  }>;
};

interface ClassesClientProps {
  initialApps: App[];
}

export function ClassesClient({ initialApps }: ClassesClientProps) {
  const [apps, setApps] = useState(initialApps);
  const [isPending, startTransition] = useTransition();
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<{
    id: string;
    appId: string;
    name: string;
    description: string | null;
  } | null>(null);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, string> | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const refreshData = () => {
    startTransition(async () => {
      const updatedApps = await getAllApps();
      setApps(updatedApps);
    });
  };

  const handleCreateClass = async (data: {
    appId: string;
    name: string;
    description?: string;
  }) => {
    await createClass(data);
    refreshData();
    setClassModalOpen(false);
  };

  const handleUpdateClass = async (
    id: string,
    data: { appId: string; name: string; description?: string }
  ) => {
    await updateClass(id, data);
    refreshData();
    setClassModalOpen(false);
    setEditingClass(null);
  };

  const handleDeleteClass = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this class? This will delete all methods."
      )
    ) {
      await deleteClass(id);
      refreshData();
    }
  };

  const handleViewMetadata = async (classId: string) => {
    setSelectedClassId(classId);
    setMetadataModalOpen(true);
    setMetadataLoading(true);
    setMetadataError(null);
    setMetadata(null);

    try {
      const result = await getClassMetadata(classId);
      if (result.success && result.metadata) {
        setMetadata(result.metadata);
      } else {
        setMetadataError(result.error || "Failed to load metadata");
      }
    } catch (error) {
      setMetadataError(
        error instanceof Error ? error.message : "Unknown error"
      );
    } finally {
      setMetadataLoading(false);
    }
  };

  // Flatten classes for table display
  const classes = apps.flatMap((app) =>
    app.classes.map((cls) => ({
      ...cls,
      appName: app.name,
      appId: app.id,
    }))
  );

  // Pagination logic
  const totalPages = Math.ceil(classes.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedClasses = classes.slice(startIndex, endIndex);

  // Reset to page 1 when classes change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [classes.length, currentPage, totalPages]);

  return (
    <div className="container mx-auto py-8 flex-1">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Classes</h1>
        <Button
          onClick={() => {
            setEditingClass(null);
            setClassModalOpen(true);
          }}
          disabled={isPending}
        >
          {isPending ? "Refreshing..." : "Create Class"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            All Classes ({classes.length})
            {isPending && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                Refreshing...
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className={`rounded-md border ${isPending ? "opacity-60" : ""}`}>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Methods</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {classes.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center text-muted-foreground py-8"
                    >
                      No classes found. Create a class to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedClasses.map((cls) => (
                    <TableRow key={cls.id}>
                      <TableCell className="font-medium">
                        {cls.appName}
                      </TableCell>
                      <TableCell className="font-medium">{cls.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {cls.description || "-"}
                      </TableCell>
                      <TableCell>{cls.methods.length}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMetadata(cls.id)}
                            disabled={isPending}
                          >
                            Meta
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingClass({
                                id: cls.id,
                                appId: cls.appId,
                                name: cls.name,
                                description: cls.description,
                              });
                              setClassModalOpen(true);
                            }}
                            disabled={isPending}
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteClass(cls.id)}
                            disabled={isPending}
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={classes.length}
          />
        </CardContent>
      </Card>

      <ClassModal
        open={classModalOpen}
        onOpenChange={setClassModalOpen}
        onSubmit={
          editingClass
            ? (data) => handleUpdateClass(editingClass.id, data)
            : handleCreateClass
        }
        initialData={
          editingClass
            ? {
                appId: editingClass.appId,
                name: editingClass.name,
                description: editingClass.description || undefined,
              }
            : undefined
        }
        apps={apps}
      />

      <MetadataModal
        open={metadataModalOpen}
        onOpenChange={setMetadataModalOpen}
        title={classes.find((c) => c.id === selectedClassId)?.name || "Class"}
        metadata={metadata}
        error={metadataError}
        loading={metadataLoading}
      />
    </div>
  );
}
