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
  createClass,
  createMethod,
  updateApp,
  updateClass,
  updateMethod,
  deleteMethod,
  getAllApps,
} from "@/app/actions/tools";
import { getMethodMetadata } from "@/app/actions/vectors";
import { AppModal } from "./app-modal";
import { ClassModal } from "./class-modal";
import { MethodModal } from "./method-modal";
import { MetadataModal } from "@/components/metadata-modal";
import { Pagination } from "@/components/pagination";

type App = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  classes: Array<{
    id: string;
    slug: string;
    name: string;
    description: string | null;
    methods: Array<{
      id: string;
      slug: string;
      name: string;
      path: string;
      httpVerb: string;
      description: string | null;
      arguments: unknown; // JsonValue from Prisma
      returnType: string | null;
      returnDescription: string | null;
    }>;
  }>;
};

interface RegisteredToolsClientProps {
  initialApps: App[];
}

export function RegisteredToolsClient({
  initialApps,
}: RegisteredToolsClientProps) {
  const [apps, setApps] = useState(initialApps);
  const [isPending, startTransition] = useTransition();
  const [appModalOpen, setAppModalOpen] = useState(false);
  const [classModalOpen, setClassModalOpen] = useState(false);
  const [methodModalOpen, setMethodModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [editingClass, setEditingClass] = useState<{
    id: string;
    appId: string;
    name: string;
    description: string | null;
  } | null>(null);
  const [editingMethod, setEditingMethod] = useState<{
    id: string;
    classId: string;
    name: string;
    path: string;
    httpVerb: string;
    description: string | null;
    arguments: Array<{ name: string; type: string; description: string }>;
    returnType: string | null;
    returnDescription: string | null;
  } | null>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [metadataModalOpen, setMetadataModalOpen] = useState(false);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
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

  const handleCreateClass = async (data: {
    appId: string;
    name: string;
    description?: string;
  }) => {
    await createClass(data);
    refreshData();
    setClassModalOpen(false);
    setSelectedAppId(null);
  };

  const handleUpdateClass = async (
    id: string,
    data: { appId: string; name: string; description?: string }
  ) => {
    await updateClass(id, data);
    refreshData();
    setClassModalOpen(false);
    setEditingClass(null);
    setSelectedAppId(null);
  };

  const handleCreateMethod = async (data: {
    classId: string;
    name: string;
    path: string;
    httpVerb: string;
    description?: string;
    arguments: Array<{ name: string; type: string; description: string }>;
    returnType?: string;
    returnDescription?: string;
  }) => {
    await createMethod({
      ...data,
      httpVerb: data.httpVerb as
        | "GET"
        | "POST"
        | "PUT"
        | "DELETE"
        | "PATCH"
        | "HEAD"
        | "OPTIONS",
    });
    refreshData();
    setMethodModalOpen(false);
    setSelectedAppId(null);
  };

  const handleUpdateMethod = async (
    id: string,
    data: {
      classId: string;
      name: string;
      path: string;
      httpVerb: string;
      description?: string;
      arguments: Array<{ name: string; type: string; description: string }>;
      returnType?: string;
      returnDescription?: string;
    }
  ) => {
    await updateMethod(id, {
      ...data,
      httpVerb: data.httpVerb as
        | "GET"
        | "POST"
        | "PUT"
        | "DELETE"
        | "PATCH"
        | "HEAD"
        | "OPTIONS",
    });
    refreshData();
    setMethodModalOpen(false);
    setEditingMethod(null);
    setSelectedAppId(null);
  };

  const handleDeleteMethod = async (id: string) => {
    if (confirm("Are you sure you want to delete this method?")) {
      await deleteMethod(id);
      refreshData();
    }
  };

  const handleViewMetadata = async (methodId: string) => {
    setSelectedMethodId(methodId);
    setMetadataModalOpen(true);
    setMetadataLoading(true);
    setMetadataError(null);
    setMetadata(null);

    try {
      const result = await getMethodMetadata(methodId);
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

  // Flatten methods for table display
  const methods = apps.flatMap((app) =>
    app.classes.flatMap((cls) =>
      cls.methods.map((method) => ({
        ...method,
        appName: app.name,
        className: cls.name,
        classId: cls.id,
        appId: app.id,
      }))
    )
  );

  // Pagination logic
  const totalPages = Math.ceil(methods.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedMethods = methods.slice(startIndex, endIndex);

  // Reset to page 1 when methods change
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1);
    }
  }, [methods.length, currentPage, totalPages]);

  return (
    <div className="container mx-auto py-4 md:py-8 px-3 md:px-4 flex-1">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 md:mb-6 gap-3">
        <h1 className="text-xl md:text-3xl font-bold">Methods</h1>
        <div className="flex flex-wrap gap-1.5 md:gap-2">
          <Button
            onClick={() => {
              setEditingApp(null);
              setAppModalOpen(true);
            }}
            disabled={isPending}
            size="sm"
            className="text-xs md:text-sm"
          >
            {isPending ? "..." : "+ App"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingClass(null);
              setSelectedAppId(null);
              setClassModalOpen(true);
            }}
            disabled={isPending}
            size="sm"
            className="text-xs md:text-sm"
          >
            {isPending ? "..." : "+ Class"}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              setEditingMethod(null);
              setSelectedAppId(null);
              setMethodModalOpen(true);
            }}
            disabled={isPending}
            size="sm"
            className="text-xs md:text-sm"
          >
            {isPending ? "..." : "+ Method"}
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">
            All Methods ({methods.length})
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
                  <TableHead className="hidden md:table-cell text-xs md:text-sm">
                    App
                  </TableHead>
                  <TableHead className="text-xs md:text-sm">Class</TableHead>
                  <TableHead className="text-xs md:text-sm">Method</TableHead>
                  <TableHead className="text-xs md:text-sm">Verb</TableHead>
                  <TableHead className="hidden lg:table-cell text-xs md:text-sm">
                    Path
                  </TableHead>
                  <TableHead className="hidden xl:table-cell text-xs md:text-sm">
                    Description
                  </TableHead>
                  <TableHead className="text-right text-xs md:text-sm">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {methods.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="text-center text-muted-foreground py-8 text-xs md:text-sm"
                    >
                      No methods found. Create an app, class, and method to get
                      started.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMethods.map((method) => (
                    <TableRow key={method.id}>
                      <TableCell className="hidden md:table-cell font-medium text-xs md:text-sm">
                        {method.appName}
                      </TableCell>
                      <TableCell className="text-xs md:text-sm">
                        {method.className}
                      </TableCell>
                      <TableCell className="text-xs md:text-sm">
                        {method.name}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center rounded-full bg-primary/10 px-1.5 md:px-2 py-0.5 md:py-1 text-[10px] md:text-xs font-medium text-primary">
                          {method.httpVerb}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell font-mono text-xs md:text-sm">
                        {method.path}
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-muted-foreground text-xs md:text-sm">
                        {method.description || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 md:gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewMetadata(method.id)}
                            disabled={isPending}
                            className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8"
                          >
                            Meta
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              const app = apps.find(
                                (a) => a.id === method.appId
                              );
                              const cls = app?.classes.find(
                                (c) => c.id === method.classId
                              );
                              if (cls) {
                                setEditingMethod({
                                  id: method.id,
                                  classId: method.classId,
                                  name: method.name,
                                  path: method.path,
                                  httpVerb: method.httpVerb,
                                  description: method.description || null,
                                  arguments: (Array.isArray(method.arguments)
                                    ? method.arguments
                                    : []) as Array<{
                                    name: string;
                                    type: string;
                                    description: string;
                                  }>,
                                  returnType: method.returnType || null,
                                  returnDescription:
                                    method.returnDescription || null,
                                });
                                setMethodModalOpen(true);
                              }
                            }}
                            disabled={isPending}
                            className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMethod(method.id)}
                            disabled={isPending}
                            className="text-[10px] md:text-xs px-2 md:px-3 h-7 md:h-8 hidden md:inline-flex"
                          >
                            Delete
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteMethod(method.id)}
                            disabled={isPending}
                            className="text-[10px] md:text-xs px-2 h-7 md:hidden"
                          >
                            Del
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
            totalItems={methods.length}
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
            : selectedAppId
              ? { appId: selectedAppId }
              : undefined
        }
        apps={apps}
      />

      <MethodModal
        open={methodModalOpen}
        onOpenChange={setMethodModalOpen}
        onSubmit={
          editingMethod
            ? (data) => handleUpdateMethod(editingMethod.id, data)
            : handleCreateMethod
        }
        initialData={
          editingMethod
            ? {
                classId: editingMethod.classId,
                name: editingMethod.name,
                path: editingMethod.path,
                httpVerb: editingMethod.httpVerb as
                  | "GET"
                  | "POST"
                  | "PUT"
                  | "DELETE"
                  | "PATCH"
                  | "HEAD"
                  | "OPTIONS",
                description: editingMethod.description || undefined,
                arguments: editingMethod.arguments,
                returnType: editingMethod.returnType || undefined,
                returnDescription: editingMethod.returnDescription || undefined,
              }
            : selectedAppId
              ? { classId: selectedAppId }
              : undefined
        }
        apps={apps}
      />

      <MetadataModal
        open={metadataModalOpen}
        onOpenChange={setMetadataModalOpen}
        title={methods.find((m) => m.id === selectedMethodId)?.name || "Method"}
        metadata={metadata}
        error={metadataError}
        loading={metadataLoading}
      />
    </div>
  );
}
