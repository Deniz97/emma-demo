"use server";

import {
  populateAppData,
  populateClassData,
  populateMethodData,
} from "@/lib/vector-service";
import { prisma } from "@/lib/prisma";

/**
 * Populate vector data for an App
 */
export async function populateAppVectors(appId: string) {
  try {
    await populateAppData(appId);
    return { success: true };
  } catch (error) {
    console.error("Error populating app vectors:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Populate vector data for a Class
 */
export async function populateClassVectors(classId: string) {
  try {
    await populateClassData(classId);
    return { success: true };
  } catch (error) {
    console.error("Error populating class vectors:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Populate vector data for a Method
 */
export async function populateMethodVectors(methodId: string) {
  try {
    await populateMethodData(methodId);
    return { success: true };
  } catch (error) {
    console.error("Error populating method vectors:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get statistics about vector data population
 */
export async function getVectorStats() {
  try {
    const [appStats, classStats, methodStats] = await Promise.all([
      prisma.$queryRaw<Array<{ total: number; with_vectors: number }>>`
        SELECT 
          (SELECT COUNT(*) FROM apps) as total,
          (SELECT COUNT(*) FROM app_data) as with_vectors
      `,
      prisma.$queryRaw<Array<{ total: number; with_vectors: number }>>`
        SELECT 
          (SELECT COUNT(*) FROM classes) as total,
          (SELECT COUNT(*) FROM class_data) as with_vectors
      `,
      prisma.$queryRaw<Array<{ total: number; with_vectors: number }>>`
        SELECT 
          (SELECT COUNT(*) FROM methods) as total,
          (SELECT COUNT(*) FROM method_data) as with_vectors
      `,
    ]);

    return {
      success: true,
      stats: {
        apps: {
          total: Number(appStats[0]?.total || 0),
          withVectors: Number(appStats[0]?.with_vectors || 0),
        },
        classes: {
          total: Number(classStats[0]?.total || 0),
          withVectors: Number(classStats[0]?.with_vectors || 0),
        },
        methods: {
          total: Number(methodStats[0]?.total || 0),
          withVectors: Number(methodStats[0]?.with_vectors || 0),
        },
      },
    };
  } catch (error) {
    console.error("Error getting vector stats:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get metadata for an App
 */
export async function getAppMetadata(appId: string) {
  try {
    const appData = await prisma.$queryRaw<
      Array<{
        metadataKeys: string[];
        metadataValues: string[];
      }>
    >`
      SELECT "metadataKeys", "metadataValues"
      FROM app_data
      WHERE "appId" = ${appId}
      LIMIT 1
    `;

    if (appData.length === 0) {
      return { success: false, error: "No metadata found for this app" };
    }

    const metadata: Record<string, string> = {};
    appData[0].metadataKeys.forEach((key, index) => {
      const values = appData[0].metadataValues as string[];
      if (values[index]) {
        metadata[key] = values[index];
      }
    });

    return { success: true, metadata };
  } catch (error) {
    console.error("Error getting app metadata:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get metadata for a Class
 */
export async function getClassMetadata(classId: string) {
  try {
    const classData = await prisma.$queryRaw<
      Array<{
        metadataKeys: string[];
        metadataValues: string[];
      }>
    >`
      SELECT "metadataKeys", "metadataValues"
      FROM class_data
      WHERE "classId" = ${classId}
      LIMIT 1
    `;

    if (classData.length === 0) {
      return { success: false, error: "No metadata found for this class" };
    }

    const metadata: Record<string, string> = {};
    classData[0].metadataKeys.forEach((key, index) => {
      const values = classData[0].metadataValues as string[];
      if (values[index]) {
        metadata[key] = values[index];
      }
    });

    return { success: true, metadata };
  } catch (error) {
    console.error("Error getting class metadata:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Get metadata for a Method
 */
export async function getMethodMetadata(methodId: string) {
  try {
    const methodData = await prisma.$queryRaw<
      Array<{
        metadataKeys: string[];
        metadataValues: string[];
      }>
    >`
      SELECT "metadataKeys", "metadataValues"
      FROM method_data
      WHERE "methodId" = ${methodId}
      LIMIT 1
    `;

    if (methodData.length === 0) {
      return { success: false, error: "No metadata found for this method" };
    }

    const metadata: Record<string, string> = {};
    methodData[0].metadataKeys.forEach((key, index) => {
      const values = methodData[0].metadataValues as string[];
      if (values[index]) {
        metadata[key] = values[index];
      }
    });

    return { success: true, metadata };
  } catch (error) {
    console.error("Error getting method metadata:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
