import { describe, expect, it } from "vitest";
import {
  deriveResourceSchema,
  deriveResourceSchemas,
  getResourceSchemaOptions,
} from "./resourceSchema";
import type { Diagram, DiagramNode } from "./types";

const resourceNode: DiagramNode = {
  id: "resource-1",
  type: "restResource",
  position: { x: 0, y: 0 },
  data: {
    kind: "restResource",
    resourceName: "items",
    methods: [],
    schema: [],
  },
};

const psqlTableNode: DiagramNode = {
  id: "table-1",
  type: "psqlTable",
  position: { x: 100, y: 0 },
  data: {
    kind: "psqlTable",
    tableName: "items",
    columns: [
      {
        id: "column-id",
        name: "id",
        type: "uuid",
        nullable: false,
        primaryKey: true,
      },
      {
        id: "column-price",
        name: "price",
        type: "numeric",
        nullable: true,
        primaryKey: false,
      },
      {
        id: "column-status",
        name: "status",
        type: "enum",
        options: { enumId: "enum-status" },
        nullable: false,
        primaryKey: false,
      },
      {
        id: "column-empty",
        name: " ",
        type: "text",
        nullable: true,
        primaryKey: false,
      },
    ],
    foreignKeys: [],
    indices: [],
  },
};

const disconnectedTableNode: DiagramNode = {
  id: "table-2",
  type: "psqlTable",
  position: { x: 200, y: 0 },
  data: {
    kind: "psqlTable",
    tableName: "audit_log",
    columns: [
      {
        id: "column-event",
        name: "event",
        type: "text",
        nullable: false,
        primaryKey: false,
      },
    ],
    foreignKeys: [],
    indices: [],
  },
};

const createDiagram = (overrides: Partial<Diagram> = {}): Diagram => ({
  id: "diagram-1",
  name: "Test diagram",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  psqlEnums: [{ id: "enum-status", name: "status_enum", values: ["draft"] }],
  nodes: [resourceNode, psqlTableNode, disconnectedTableNode],
  edges: [
    {
      id: "edge-1",
      source: resourceNode.id,
      target: psqlTableNode.id,
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    },
  ],
  ...overrides,
});

describe("resource schema derivation", () => {
  it("derives resource fields from connected PSQL table columns", () => {
    expect(deriveResourceSchema(createDiagram(), resourceNode.id)).toEqual([
      {
        id: "table-1-column-id",
        name: "id",
        type: "string",
        nullable: false,
        sourceTableId: "table-1",
        sourceColumnId: "column-id",
      },
      {
        id: "table-1-column-price",
        name: "price",
        type: "number",
        nullable: true,
        sourceTableId: "table-1",
        sourceColumnId: "column-price",
      },
      {
        id: "table-1-column-status",
        name: "status",
        type: "string",
        nullable: false,
        sourceTableId: "table-1",
        sourceColumnId: "column-status",
      },
    ]);
  });

  it("treats table-to-resource and resource-to-table edges as schema sources", () => {
    const diagram = createDiagram({
      edges: [
        {
          id: "edge-1",
          source: psqlTableNode.id,
          target: resourceNode.id,
          type: "smoothstep",
          data: { kind: "write", dataPath: "all" },
        },
      ],
    });

    expect(deriveResourceSchema(diagram, resourceNode.id)).toHaveLength(3);
  });

  it("collects derived schemas for resource nodes only", () => {
    const schemas = deriveResourceSchemas(createDiagram());

    expect([...schemas.keys()]).toEqual([resourceNode.id]);
    expect(schemas.get(resourceNode.id)?.map((field) => field.name)).toEqual([
      "id",
      "price",
      "status",
    ]);
  });

  it("builds field selection options with all first", () => {
    expect(
      getResourceSchemaOptions([
        {
          id: "field-1",
          name: "name",
          type: "string",
          nullable: false,
          sourceTableId: "table-1",
          sourceColumnId: "column-name",
        },
      ]),
    ).toEqual(["all", "name"]);
  });
});
