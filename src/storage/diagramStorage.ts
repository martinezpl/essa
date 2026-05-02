import { diagramCollectionSchema, type DiagramCollection } from "../domain/types";
import { createStarterDiagram } from "../domain/factories";

const STORAGE_KEY = "essa.diagrams.v1";

export const createInitialCollection = (): DiagramCollection => {
  const starterDiagram = createStarterDiagram();

  return {
    version: 1,
    activeDiagramId: starterDiagram.id,
    diagrams: [starterDiagram],
  };
};

export const loadDiagramCollection = (): DiagramCollection => {
  try {
    const rawValue = localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return createInitialCollection();
    }

    const parsedValue = JSON.parse(rawValue) as unknown;
    const result = diagramCollectionSchema.safeParse(parsedValue);

    if (!result.success) {
      return createInitialCollection();
    }

    return result.data;
  } catch {
    return createInitialCollection();
  }
};

export const saveDiagramCollection = (collection: DiagramCollection) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(collection));
};
