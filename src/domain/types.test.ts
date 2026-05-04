import { describe, expect, it } from "vitest";
import {
  diagramSchema,
  edgeDataSchema,
  blockDataSchema,
  psqlColumnTypeSchema,
  psqlColumnOptionsSchema,
  psqlEnumSchema,
  psqlIndexSchema,
  restResourceMethodSchema,
  psqlColumnSchema,
  psqlTableDataSchema,
} from "./types";

describe("domain schemas", () => {
  it("normalizes legacy edge kinds and defaults data paths", () => {
    expect(edgeDataSchema.parse({ kind: "tableBacksResource" })).toEqual({
      kind: "write",
      dataPath: "all",
    });
    expect(edgeDataSchema.parse({ kind: "viewUsesResource" })).toEqual({
      kind: "read",
      dataPath: "all",
    });
    expect(edgeDataSchema.parse({ kind: "resourceReadsWritesTable" })).toEqual({
      kind: "read",
      dataPath: "all",
    });
    expect(edgeDataSchema.parse({ kind: "read/write" })).toEqual({
      kind: "read/write",
      dataPath: "all",
    });
  });

  it("parses annotation block data", () => {
    expect(blockDataSchema.parse({
      kind: "annotation",
      label: "Admin area",
    })).toEqual({
      kind: "annotation",
      label: "Admin area",
      color: "#818cf8",
      width: 520,
      height: 320,
    });
  });

  it("expands shorthand REST methods into full method contracts", () => {
    expect(restResourceMethodSchema.parse("GET /")).toEqual({
      id: "method-GET /",
      kind: "GET /",
      input: [],
      output: { returnsArray: true },
    });
    expect(restResourceMethodSchema.parse("DELETE /{id}")).toEqual({
      id: "method-DELETE /{id}",
      kind: "DELETE /{id}",
      input: [],
      output: { returnsArray: false },
    });
  });

  it("normalizes legacy method input/output shapes to the new array form", () => {
    const parsed = restResourceMethodSchema.parse({
      id: "method-1",
      kind: "POST /",
      input: { mode: "payload", fields: ["all"] },
      output: { fields: ["id"], returnsArray: false },
    });

    expect(parsed.input).toEqual([]);
    expect(parsed.output).toEqual({ returnsArray: false });
  });

  it("round-trips method input fields", () => {
    const parsed = restResourceMethodSchema.parse({
      id: "method-1",
      kind: "POST /",
      input: [
        {
          id: "input-1",
          name: "title",
          type: "string",
          mode: "payload",
        },
      ],
      output: { returnsArray: true },
    });

    expect(parsed.input).toEqual([
      {
        id: "input-1",
        name: "title",
        type: "string",
        mode: "payload",
      },
    ]);
    expect(parsed.output).toEqual({ returnsArray: true });
  });

  it("forces query method inputs to use string types", () => {
    const parsed = restResourceMethodSchema.parse({
      id: "method-1",
      kind: "GET /",
      input: [
        {
          id: "input-1",
          name: "page",
          type: "integer",
          mode: "query",
        },
      ],
      output: { returnsArray: true },
    });

    expect(parsed.input).toEqual([
      {
        id: "input-1",
        name: "page",
        type: "string",
        mode: "query",
      },
    ]);
  });

  it("parses PSQL columns without foreign keys", () => {
    expect(psqlColumnTypeSchema.options).toEqual(
      expect.arrayContaining([
        "bigserial",
        "double precision",
        "enum",
        "timestamptz",
        "inet",
        "point",
        "tsvector",
        "jsonb[]",
      ]),
    );
    expect(
      psqlColumnSchema.parse({
        id: "column-id",
        name: "id",
        type: "uuid",
        nullable: false,
      }),
    ).toEqual({
      id: "column-id",
      name: "id",
      type: "uuid",
      nullable: false,
      unique: false,
    });
  });

  it("parses PSQL column constraints and strips empty default/check", () => {
    expect(
      psqlColumnSchema.parse({
        id: "column-1",
        name: "score",
        type: "integer",
        nullable: true,
        unique: true,
        defaultValue: "0",
        check: "score >= 0",
      }),
    ).toEqual({
      id: "column-1",
      name: "score",
      type: "integer",
      nullable: true,
      unique: true,
      defaultValue: "0",
      check: "score >= 0",
    });

    expect(
      psqlColumnSchema.parse({
        id: "column-2",
        name: "note",
        type: "text",
        nullable: false,
        defaultValue: "",
        check: "",
        unique: false,
      }),
    ).toEqual({
      id: "column-2",
      name: "note",
      type: "text",
      nullable: false,
      unique: false,
    });
  });

  it("parses PSQL column options and enum definitions", () => {
    expect(
      psqlColumnOptionsSchema.parse({
        length: 255,
        precision: 10,
        scale: 2,
        arrayItemType: "uuid",
        enumId: "enum-status",
      }),
    ).toEqual({
      length: 255,
      precision: 10,
      scale: 2,
      arrayItemType: "uuid",
      enumId: "enum-status",
    });

    expect(
      psqlEnumSchema.parse({
        id: "enum-status",
        name: "status_enum",
        values: ["draft", "published"],
      }),
    ).toEqual({
      id: "enum-status",
      name: "status_enum",
      values: ["draft", "published"],
    });
  });

  it("defaults PSQL index access method to btree", () => {
    expect(
      psqlIndexSchema.parse({
        id: "index-1",
        columns: ["column-name"],
        unique: false,
      }),
    ).toMatchObject({
      method: "btree",
    });
  });

  it("parses PSQL table foreign keys", () => {
    const table = psqlTableDataSchema.parse({
      kind: "psqlTable",
      tableName: "posts",
      columns: [],
      foreignKeys: [
        {
          id: "foreign-key-1",
          name: "user_id",
          type: "uuid",
          nullable: false,
          targetTableId: "table-users",
          targetColumnId: "column-id",
        },
      ],
      indices: [],
    });

    expect(table.foreignKeys).toEqual([
      {
        id: "foreign-key-1",
        name: "user_id",
        type: "uuid",
        nullable: false,
        targetTableId: "table-users",
        targetColumnId: "column-id",
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
      },
    ]);
  });

  it("normalizes legacy foreign key shapes (columnId-based)", () => {
    const table = psqlTableDataSchema.parse({
      kind: "psqlTable",
      tableName: "posts",
      columns: [],
      foreignKeys: [
        {
          id: "foreign-key-legacy",
          columnId: "column-user-id",
          targetTableId: "table-users",
          targetColumnId: "column-id",
        },
      ],
      indices: [],
    });

    expect(table.foreignKeys).toEqual([
      {
        id: "foreign-key-legacy",
        name: "",
        type: "uuid",
        nullable: false,
        targetTableId: "table-users",
        targetColumnId: "column-id",
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
      },
    ]);
  });

  it("parses diagram edges through edge data migrations", () => {
    const diagram = diagramSchema.parse({
      id: "diagram-1",
      name: "Legacy diagram",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      nodes: [
        {
          id: "resource-1",
          type: "restResource",
          position: { x: 0, y: 0 },
          data: {
            kind: "restResource",
            resourceName: "items",
            methods: ["GET /"],
          },
        },
      ],
      edges: [
        {
          id: "edge-1",
          source: "table-1",
          target: "resource-1",
          data: { kind: "tableBacksResource" },
        },
      ],
    });

    expect(diagram.nodes[0].data).toMatchObject({
      kind: "restResource",
      methods: [
        {
          kind: "GET /",
          input: [],
          output: { returnsArray: true },
        },
      ],
      schema: [],
    });
    expect(diagram.psqlEnums).toEqual([]);
    expect(diagram.edges[0].data).toEqual({ kind: "write", dataPath: "all" });
  });
});
