/**
 * Type definitions for vector data models
 */

export interface VectorData {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppData extends VectorData {
  appId: string;
  nameVector: number[];
  descriptionVector: number[] | null;
  metadataKeys: string[];
  metadataValues: string[];
  metadataVectors: number[][];
}

export interface ClassData extends VectorData {
  classId: string;
  nameVector: number[];
  descriptionVector: number[] | null;
  metadataKeys: string[];
  metadataValues: string[];
  metadataVectors: number[][];
}

export interface MethodData extends VectorData {
  methodId: string;
  nameVector: number[];
  descriptionVector: number[] | null;
  metadataKeys: string[];
  metadataValues: string[];
  metadataVectors: number[][];
}

export interface EmbeddingConfig {
  model: string;
  dimensions: number;
}

export interface MetadataField {
  key: string;
  value: string;
  vector: number[];
}
