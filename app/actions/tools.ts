"use server";

import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function getTools() {
  const methods = await prisma.method.findMany({
    include: {
      class: {
        include: {
          app: true,
        },
      },
    },
  });

  return methods;
}

export async function getToolsByApp(appId: string) {
  const app = await prisma.app.findUnique({
    where: { id: appId },
    include: {
      classes: {
        include: {
          methods: true,
        },
      },
    },
  });

  return app;
}

export async function getAllApps() {
  const apps = await prisma.app.findMany({
    include: {
      classes: {
        include: {
          methods: true,
        },
      },
      category: true,
    },
  });

  // Map category relation to category name for UI
  return apps.map((app) => ({
    ...app,
    category: app.category?.name || null,
  }));
}

// Schemas for validation
const appSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const classSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

const methodSchema = z.object({
  classId: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
  httpVerb: z.enum([
    "GET",
    "POST",
    "PUT",
    "DELETE",
    "PATCH",
    "HEAD",
    "OPTIONS",
  ]),
  description: z.string().optional(),
  arguments: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      description: z.string(),
    })
  ),
  returnType: z.string().optional(),
  returnDescription: z.string().optional(),
});

// App CRUD operations
export async function createApp(data: z.infer<typeof appSchema>) {
  const validated = appSchema.parse(data);
  const { slugify } = await import("@/lib/slug");
  const slug = slugify(validated.name);

  return await prisma.app.create({
    data: {
      slug,
      name: validated.name,
      description: validated.description,
    },
  });
}

export async function updateApp(id: string, data: z.infer<typeof appSchema>) {
  const validated = appSchema.parse(data);
  const { slugify } = await import("@/lib/slug");
  const slug = slugify(validated.name);

  return await prisma.app.update({
    where: { id },
    data: {
      slug,
      name: validated.name,
      description: validated.description,
    },
  });
}

export async function deleteApp(id: string) {
  return await prisma.app.delete({
    where: { id },
  });
}

// Class CRUD operations
export async function createClass(data: z.infer<typeof classSchema>) {
  const validated = classSchema.parse(data);
  const { slugify } = await import("@/lib/slug");

  // Get app to create unique slug
  const app = await prisma.app.findUnique({ where: { id: validated.appId } });
  if (!app) {
    throw new Error("App not found");
  }

  const slug = `${app.slug}-${slugify(validated.name)}`;

  return await prisma.class.create({
    data: {
      slug,
      appId: validated.appId,
      name: validated.name,
      description: validated.description,
    },
  });
}

export async function updateClass(
  id: string,
  data: z.infer<typeof classSchema>
) {
  const validated = classSchema.parse(data);
  const { slugify } = await import("@/lib/slug");

  // Get app to create unique slug
  const app = await prisma.app.findUnique({ where: { id: validated.appId } });
  if (!app) {
    throw new Error("App not found");
  }

  const slug = `${app.slug}-${slugify(validated.name)}`;

  return await prisma.class.update({
    where: { id },
    data: {
      slug,
      appId: validated.appId,
      name: validated.name,
      description: validated.description,
    },
  });
}

export async function deleteClass(id: string) {
  return await prisma.class.delete({
    where: { id },
  });
}

// Method CRUD operations
export async function createMethod(data: z.infer<typeof methodSchema>) {
  const validated = methodSchema.parse(data);
  const { slugify } = await import("@/lib/slug");

  // Get class to create unique slug
  const class_ = await prisma.class.findUnique({
    where: { id: validated.classId },
  });
  if (!class_) {
    throw new Error("Class not found");
  }

  const slug = `${class_.slug}-${slugify(validated.name)}`;

  return await prisma.method.create({
    data: {
      slug,
      classId: validated.classId,
      name: validated.name,
      path: validated.path,
      httpVerb: validated.httpVerb,
      description: validated.description,
      arguments: validated.arguments,
      returnType: validated.returnType,
      returnDescription: validated.returnDescription,
    },
  });
}

export async function updateMethod(
  id: string,
  data: z.infer<typeof methodSchema>
) {
  const validated = methodSchema.parse(data);
  const { slugify } = await import("@/lib/slug");

  // Get class to create unique slug
  const class_ = await prisma.class.findUnique({
    where: { id: validated.classId },
  });
  if (!class_) {
    throw new Error("Class not found");
  }

  const slug = `${class_.slug}-${slugify(validated.name)}`;

  return await prisma.method.update({
    where: { id },
    data: {
      slug,
      classId: validated.classId,
      name: validated.name,
      path: validated.path,
      httpVerb: validated.httpVerb,
      description: validated.description,
      arguments: validated.arguments,
      returnType: validated.returnType,
      returnDescription: validated.returnDescription,
    },
  });
}

export async function deleteMethod(id: string) {
  return await prisma.method.delete({
    where: { id },
  });
}

// Legacy function for backward compatibility
export async function createTool(data: {
  classId: string;
  name: string;
  path: string;
  httpVerb: string;
  description?: string;
  arguments: unknown;
  returnType?: string;
  returnDescription?: string;
}) {
  return createMethod({
    classId: data.classId,
    name: data.name,
    path: data.path,
    httpVerb: data.httpVerb as
      | "GET"
      | "POST"
      | "PUT"
      | "DELETE"
      | "PATCH"
      | "HEAD"
      | "OPTIONS",
    description: data.description,
    arguments: data.arguments as Array<{
      name: string;
      type: string;
      description: string;
    }>,
    returnType: data.returnType,
    returnDescription: data.returnDescription,
  });
}
