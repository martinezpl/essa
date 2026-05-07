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

  it("preserves latest-version collections that include annotations", () => {
    const collection = createInitialCollection();
    const annotated = {
      ...collection,
      diagrams: collection.diagrams.map((diagram) => ({
        ...diagram,
        nodes: [
          ...diagram.nodes,
          {
            id: "annotation-1",
            type: "annotation",
            position: { x: 0, y: 0 },
            data: {
              kind: "annotation",
              label: "Admin area",
              color: "#818cf8",
              width: 520,
              height: 320,
            },
          },
        ],
      })),
    };

    expect(migrateDiagramCollection(annotated)).toEqual(annotated);
  });

  it("migrates v2 collections to latest and adds column unique flags", () => {
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

    expect(result.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    const table = result.diagrams[0]?.nodes[0];
    expect(table?.data.kind).toBe("psqlTable");
    if (table?.data.kind !== "psqlTable") {
      throw new Error("Expected psql table node");
    }
    expect(table.data.columns[0]?.unique).toBe(false);
  });

  it("migrates v3 collections to latest and removes index names", () => {
    const v3 = {
      version: 3,
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
                  {
                    id: "c1",
                    name: "id",
                    type: "uuid",
                    nullable: false,
                    unique: false,
                  },
                ],
                foreignKeys: [],
                indices: [
                  {
                    id: "index-1",
                    name: "idx_items_id",
                    columns: ["c1"],
                    method: "btree",
                    unique: false,
                  },
                ],
              },
            },
          ],
          edges: [],
        },
      ],
    };

    const result = migrateDiagramCollection(v3);

    expect(result.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    const table = result.diagrams[0]?.nodes[0];
    expect(table?.data.kind).toBe("psqlTable");
    if (table?.data.kind !== "psqlTable") {
      throw new Error("Expected psql table node");
    }
    expect(table.data.indices[0]).toEqual({
      id: "index-1",
      columns: ["c1"],
      method: "btree",
      unique: false,
    });
  });

  it("migrates v4 collections to v5 without changing diagrams", () => {
    const collection = createInitialCollection();
    const v4 = {
      ...collection,
      version: 4,
    };

    expect(migrateDiagramCollection(v4)).toEqual({
      ...collection,
      version: LATEST_DIAGRAM_COLLECTION_VERSION,
    });
  });
});
