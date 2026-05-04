import { diagramCollectionSchema, type DiagramCollection } from "../domain/types";
import { createStarterDiagram } from "../domain/factories";
import {
  LATEST_DIAGRAM_COLLECTION_VERSION,
  migrateDiagramCollection,
} from "./diagramMigrations";

const STORAGE_KEY = "essa.diagrams.v1";

export const createInitialCollection = (): DiagramCollection => {
  const starterDiagram = createStarterDiagram();

  return diagramCollectionSchema.parse({
    version: LATEST_DIAGRAM_COLLECTION_VERSION,
    activeDiagramId: starterDiagram.id,
    diagrams: [starterDiagram],
  });
};

export const loadDiagramCollection = (): DiagramCollection => {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return createInitialCollection();
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    const shouldPersistMigration = !diagramCollectionSchema.safeParse(parsedValue).success;
    const collection = migrateDiagramCollection(parsedValue);

    if (shouldPersistMigration) {
      saveDiagramCollection(collection);
    }

    return collection;
  } catch {
    return createInitialCollection();
  }
};

export const saveDiagramCollection = (collection: DiagramCollection) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
};
