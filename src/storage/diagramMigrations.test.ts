import { describe, expect, it } from "vitest";
import { diagramCollectionSchema } from "../domain/types";
import { createInitialCollection } from "./diagramStorage";
import {
  LATEST_DIAGRAM_COLLECTION_VERSION,
  migrateDiagramCollection,
} from "./diagramMigrations";

describe("diagram migrations", () => {
  it("keeps the latest version constant aligned with the collection schema", () => {
    const collection = createInitialCollection();

    const result = diagramCollectionSchema.safeParse({
      ...collection,
      version: LATEST_DIAGRAM_COLLECTION_VERSION,
    });

    expect(result.success).toBe(true);
  });

  it("passes latest-version diagram collections through unchanged", () => {
    const collection = createInitialCollection();

    expect(migrateDiagramCollection(collection)).toEqual(collection);
  });

});
