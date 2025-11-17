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
    },
  });

  return apps;
}

// Placeholder functions for future tool management
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
  // TODO: Implement tool creation
  throw new Error("Not implemented yet");
}

