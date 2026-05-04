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

  it("migrates v2 collections to v3 and adds column unique flags", () => {
    const v2 = {
      version: 2,
      activeDiagramId: "diagram-1",
      diagrams: [
        {
          id: "diagram-1",
          name: "Migrated",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          psqlEnums: [],
          nodes: [
            {
              id: "table-1",
              type: "psqlTable",
              position: { x: 0, y: 0 },
              data: {
                kind: "psqlTable",
                tableName: "items",
                primaryKey: [],
                columns: [
                  { id: "c1", name: "id", type: "uuid", nullable: false },
                ],
                foreignKeys: [],
                indices: [],
              },
            },
          ],
          edges: [],
        },
      ],
    };

    const result = migrateDiagramCollection(v2);

    expect(result.version).toBe(3);
    const table = result.diagrams[0]?.nodes[0];
    expect(table?.data.kind).toBe("psqlTable");
    if (table?.data.kind !== "psqlTable") {
      throw new Error("Expected psql table node");
    }
    expect(table.data.columns[0]?.unique).toBe(false);
  });
});
