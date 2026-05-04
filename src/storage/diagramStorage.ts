import { diagramCollectionSchema, type DiagramCollection } from "../domain/types";
import { createStarterDiagram } from "../domain/factories";
import {
  LATEST_DIAGRAM_COLLECTION_VERSION,
  migrateDiagramCollection,
} from "./diagramMigrations";

const STORAGE_KEY_PREFIX = "essa.diagrams.v";

export type DiagramCollectionLoadResult = {
  collection: DiagramCollection;
  didFallback: boolean;
};

export const getPrimaryDiagramStorageKey = () =>
  `${STORAGE_KEY_PREFIX}${LATEST_DIAGRAM_COLLECTION_VERSION}`;

export const getDiagramStorageKeys = (): string[] => {
  const keys = [];

  for (let version = LATEST_DIAGRAM_COLLECTION_VERSION; version >= 1; version -= 1) {
    keys.push(`${STORAGE_KEY_PREFIX}${version}`);
  }

  return keys;
};

export const createInitialCollection = (): DiagramCollection => {
  const starterDiagram = createStarterDiagram();

  return diagramCollectionSchema.parse({
    version: LATEST_DIAGRAM_COLLECTION_VERSION,
    activeDiagramId: starterDiagram.id,
    diagrams: [starterDiagram],
  });
};

export const loadDiagramCollection = (): DiagramCollectionLoadResult => {
  let foundStoredValue = false;
  const primaryKey = getPrimaryDiagramStorageKey();

  for (const key of getDiagramStorageKeys()) {
    const rawValue = localStorage.getItem(key);

    if (!rawValue) {
      continue;
    }

    foundStoredValue = true;

    try {
      const parsedValue = JSON.parse(rawValue) as unknown;
      const shouldPersistMigration =
        key !== primaryKey || !diagramCollectionSchema.safeParse(parsedValue).success;
      const collection = migrateDiagramCollection(parsedValue);

      if (shouldPersistMigration) {
        saveDiagramCollection(collection);
      }

      return { collection, didFallback: false };
    } catch {
      continue;
    }
  }

  return {
    collection: createInitialCollection(),
    didFallback: foundStoredValue,
  };
};

export const saveDiagramCollection = (collection: DiagramCollection) => {
  localStorage.setItem(getPrimaryDiagramStorageKey(), JSON.stringify(collection));
};
