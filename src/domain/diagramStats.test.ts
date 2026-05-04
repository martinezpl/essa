import { describe, expect, it } from "vitest";
import { countDiagramConnections } from "./diagramStats";
import type { Diagram } from "./types";

const createDiagram = (): Diagram => ({
  id: "diagram-1",
  name: "Test diagram",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  psqlEnums: [],
  nodes: [
    {
      id: "resource-1",
      type: "restResource",
      position: { x: 0, y: 0 },
      data: {
        kind: "restResource",
        resourceName: "items",
        methods: [],
        schema: [],
      },
    },
    {
      id: "table-source",
      type: "psqlTable",
      position: { x: 100, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "posts",
        primaryKey: ["source-id"],
        columns: [
          {
            id: "source-id",
            name: "id",
            type: "uuid",
            nullable: false,
            unique: false,
          },
        ],
        foreignKeys: [
          {
            id: "fk-valid",
            name: "user_id",
            type: "uuid",
            nullable: false,
            targetTableId: "table-target",
            targetColumnId: "target-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
          {
            id: "fk-invalid",
            name: "missing_id",
            type: "uuid",
            nullable: false,
            targetTableId: "table-target",
            targetColumnId: "missing-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
        ],
        indices: [],
      },
    },
    {
      id: "table-target",
      type: "psqlTable",
      position: { x: 200, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "users",
        primaryKey: ["target-id"],
        columns: [
          {
            id: "target-id",
            name: "id",
            type: "uuid",
            nullable: false,
            unique: false,
          },
        ],
        foreignKeys: [],
        indices: [],
      },
    },
  ],
  edges: [
    {
      id: "edge-1",
      source: "resource-1",
      target: "table-source",
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    },
  ],
});

describe("diagram stats", () => {
  it("counts manual edges plus valid PSQL foreign key connections", () => {
    expect(countDiagramConnections(createDiagram())).toBe(2);
  });
});
