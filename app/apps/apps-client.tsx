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
  createApp,
  updateApp,
  deleteApp,
  getAllApps,
} from "@/app/actions/tools";
import { getAppMetadata } from "@/app/actions/vectors";
import { AppModal } from "../registered-tools/app-modal";
import { MetadataModal } from "@/components/metadata-modal";
import { Pagination } from "@/components/pagination";

type App = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  classes: Array<{
    id: string;
    name: string;
    methods: Array<{ id: string }>;
  }>;
};

interface AppsClientProps {
  initialApps: App[];
}

export function AppsClient({ initialApps }: AppsClientProps) {
  const [apps, setApps] = useState(initialApps);
  const [isPending, startTransition] = useTransition();
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
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

  const handleCreateApp = async (data: {
    name: string;
    description?: string;
  }) => {
    await createApp(data);
    refreshData();
    setAppModalOpen(false);
  };

  const handleUpdateApp = async (
    id: string,
    data: { name: string; description?: string }
  ) => {
    await updateApp(id, data);
    refreshData();
    setAppModalOpen(false);
    setEditingApp(null);
  };

  const handleDeleteApp = async (id: string) => {
    if (
      confirm(
        "Are you sure you want to delete this app? This will delete all classes and methods."
      )
    ) {
      await deleteApp(id);
      refreshData();
    }
  };

  const handleViewMetadata = async (appId: string, appName: string) => {
    setSelectedAppName(appName);
    setMetadataModalOpen(true);
    setMetadataLoading(true);
    setMetadataError(null);
    setMetadata(null);

    try {
      const result = await getAppMetadata(appId);
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

  // Pagination logic
  const totalPages = Math.ceil(apps.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedApps = apps.slice(startIndex, endIndex);

  // Reset to page 1 when apps change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [apps.length, currentPage, totalPages]);

  return (
    <div className="container mx-auto py-4 md:py-8 px-3 md:px-4 flex-1">
      <div className="flex justify-between items-center mb-4 md:mb-6 gap-2">
        <h1 className="text-xl md:text-3xl font-bold">Apps</h1>
        <Button
          onClick={() => {
            setEditingApp(null);
            setAppModalOpen(true);
          }}
          disabled={isPending}
          size="sm"
          className="text-xs md:text-sm"
        >
          {isPending ? "Refreshing..." : "Create"}
        </Button>
      </div>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            All Apps ({apps.length})
            {isPending && (
              <span className="ml-2 text-xs md:text-sm font-normal text-muted-foreground">
                Refreshing...
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 md:p-6">
          <div
            className={`rounded-md border overflow-x-auto ${isPending ? "opacity-60" : ""}`}
          >
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs md:text-sm">Name</TableHead>
                  <TableHead className="hidden md:table-cell text-xs md:text-sm">
                    Category
                  </TableHead>
                  <TableHead className="hidden lg:table-cell text-xs md:text-sm">
                    Description
                  </TableHead>
                  <TableHead className="text-xs md:text-sm">Classes</TableHead>
                  <TableHead className="text-xs md:text-sm">Methods</TableHead>
                  <TableHead className="text-right text-xs md:text-sm">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apps.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center text-muted-foreground py-8 text-xs md:text-sm"
                    >
                      No apps found. Create an app to get started.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedApps.map((app) => {
                    const totalMethods = app.classes.reduce(
                      (sum, cls) => sum + cls.methods.length,
                      0
                    );
                    return (
                      <TableRow key={app.id}>
                        <TableCell className="font-medium text-xs md:text-sm">
                          {app.name}
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          {app.category ? (
                            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-medium text-primary">
                              {app.category}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs md:text-sm">
                              -
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-muted-foreground text-xs md:text-sm">
                          {app.description || "-"}
                        </TableCell>
                        <TableCell className="text-xs md:text-sm">
                          {app.classes.length}
                        </TableCell>
                        <TableCell className="text-xs md:text-sm">
                          {totalMethods}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1 md:gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                handleViewMetadata(app.id, app.name)
                              }
                              disabled={isPending}
                              className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8"
                            >
                              Meta
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingApp(app);
                                setAppModalOpen(true);
                              }}
                              disabled={isPending}
                              className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8"
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApp(app.id)}
                              disabled={isPending}
                              className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8 hidden md:inline-flex"
                            >
                              Delete
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteApp(app.id)}
                              disabled={isPending}
                              className="text-[10px] md:text-xs px-2 h-7 md:hidden"
                            >
                              Del
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={setCurrentPage}
            itemsPerPage={itemsPerPage}
            totalItems={apps.length}
          />
        </CardContent>
      </Card>

      <AppModal
        open={appModalOpen}
        onOpenChange={setAppModalOpen}
        onSubmit={
          editingApp
            ? (data) => handleUpdateApp(editingApp.id, data)
            : handleCreateApp
        }
        initialData={
          editingApp
            ? {
                name: editingApp.name,
                description: editingApp.description || undefined,
              }
            : undefined
        }
      />

      <MetadataModal
        open={metadataModalOpen}
        onOpenChange={setMetadataModalOpen}
        title={selectedAppName || "App"}
        metadata={metadata}
        error={metadataError}
        loading={metadataLoading}
      />
    </div>
  );
}
