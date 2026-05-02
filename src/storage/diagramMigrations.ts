import {
  diagramCollectionSchema,
  type DiagramCollection,
} from "../domain/types";

export const LATEST_DIAGRAM_COLLECTION_VERSION = 1;

export const migrateDiagramCollection = (value: unknown): DiagramCollection => {
  return diagramCollectionSchema.parse(value);
};
