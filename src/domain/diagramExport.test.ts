import { describe, expect, it } from "vitest";
import {
  parseEssaDiagram,
  prepareImportedDiagram,
  serializeEssaDiagram,
  serializeMarkdownDiagram,
  serializeMermaidDiagram,
} from "./diagramExport";
import {
  psqlColumnSourceHandleId,
  psqlForeignKeyTargetHandleId,
} from "./psqlForeignKeys";
import type { Diagram, ResourceSchemaField, RestResourceMethod } from "./types";

const createDiagram = (): Diagram => ({
  id: "diagram-1",
  name: "Export Test",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  psqlEnums: [
    {
      id: "enum-status",
      name: "status_enum",
      values: ["draft", "published"],
    },
  ],
  nodes: [
    {
      id: "resource-1",
      type: "restResource",
      position: { x: 0, y: 0 },
      data: {
        kind: "restResource",
        resourceName: "posts",
        description: "Public article collection",
        methods: [
          {
            id: "method-1",
            kind: "GET /",
            input: [
              {
                id: "input-1",
                name: "status",
                type: "string",
                mode: "query",
                description: "Filter by publication status",
              },
            ],
            output: { returnsArray: true, exclude: [] },
          },
        ],
        schema: [
          {
            id: "schema-field-1",
            name: "status",
            type: "string",
            isArray: false,
            enum: ["draft", "published"],
            nullable: false,
            sourceTableId: "table-posts",
            sourceColumnId: "column-status",
            exclude: [],
            description: "Current publication status",
          },
        ],
      },
    },
    {
      id: "table-posts",
      type: "psqlTable",
      position: { x: 100, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "posts",
        primaryKey: ["column-id"],
        columns: [
          {
            id: "column-id",
            name: "id",
            type: "uuid",
            nullable: false,
            unique: false,
            defaultValue: "gen_random_uuid()",
          },
          {
            id: "column-status",
            name: "status",
            type: "enum",
            options: { enumId: "enum-status" },
            nullable: false,
            unique: true,
            check: "true",
          },
        ],
        foreignKeys: [
          {
            id: "fk-author",
            name: "author_id",
            type: "uuid",
            nullable: false,
            targetTableId: "table-users",
            targetColumnId: "column-user-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
        ],
        indices: [
          {
            id: "index-status",
            columns: ["column-status"],
            method: "btree",
            unique: false,
          },
          {
            id: "index-fk-author",
            columns: ["fk-author"],
            method: "btree",
            unique: false,
          },
        ],
      },
    },
    {
      id: "table-users",
      type: "psqlTable",
      position: { x: 200, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "users",
        primaryKey: ["column-user-id"],
        columns: [
          {
            id: "column-user-id",
            name: "id",
            type: "serial",
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
      target: "table-posts",
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    },
    {
      id: "edge-fk-author",
      source: "table-users",
      sourceHandle: psqlColumnSourceHandleId("column-user-id"),
      target: "table-posts",
      targetHandle: psqlForeignKeyTargetHandleId("fk-author"),
      type: "smoothstep",
      data: { kind: "read", dataPath: "FK" },
    },
  ],
});

describe("diagram export", () => {
  it("serializes and parses a single .essa diagram payload", () => {
    const diagram = createDiagram();

    expect(parseEssaDiagram(serializeEssaDiagram(diagram))).toEqual(diagram);
  });

  it("prepares imported diagrams with fresh ids and remapped references", () => {
    const imported = prepareImportedDiagram(createDiagram());
    const resource = imported.nodes.find((node) => node.data.kind === "restResource");
    const posts = imported.nodes.find(
      (node) => node.data.kind === "psqlTable" && node.data.tableName === "posts",
    );
    const users = imported.nodes.find(
      (node) => node.data.kind === "psqlTable" && node.data.tableName === "users",
    );

    expect(imported.id).not.toBe("diagram-1");
    expect(imported.psqlEnums[0].id).not.toBe("enum-status");
    expect(imported.edges[0].source).toBe(resource?.id);
    expect(imported.edges[0].target).toBe(posts?.id);

    if (posts?.data.kind !== "psqlTable" || users?.data.kind !== "psqlTable") {
      throw new Error("Expected PSQL tables");
    }

    const statusColumn = posts.data.columns.find((column) => column.name === "status");
    expect(statusColumn?.options?.enumId).toBe(imported.psqlEnums[0].id);
    expect(posts.data.indices[0].columns).toEqual([statusColumn?.id]);
    expect(posts.data.primaryKey).toEqual([posts.data.columns[0].id]);
    expect(users.data.primaryKey).toEqual([users.data.columns[0].id]);
    expect(posts.data.foreignKeys[0].targetTableId).toBe(users.id);
    expect(posts.data.foreignKeys[0].targetColumnId).toBe(users.data.columns[0].id);
    expect(imported.edges[1].source).toBe(users.id);
    expect(imported.edges[1].sourceHandle).toBe(
      psqlColumnSourceHandleId(users.data.columns[0].id),
    );
    expect(imported.edges[1].target).toBe(posts.id);
    expect(imported.edges[1].targetHandle).toBe(
      psqlForeignKeyTargetHandleId(posts.data.foreignKeys[0].id),
    );
  });

  it("omits annotation blocks from Mermaid flowchart and ER export", () => {
    const base = createDiagram();
    const annotationId = "annotation-1";
    const diagram: Diagram = {
      ...base,
      nodes: [
        ...base.nodes,
        {
          id: annotationId,
          type: "annotation",
          position: { x: 0, y: 0 },
          data: {
            kind: "annotation",
            label: "Sticky note for reviewers",
            color: "#818cf8",
            width: 520,
            height: 320,
          },
        },
      ],
      edges: [
        ...base.edges,
        {
          id: "edge-to-annotation",
          source: "resource-1",
          target: annotationId,
          type: "smoothstep",
          data: { kind: "read", dataPath: "all" },
        },
      ],
    };

    const mermaid = serializeMermaidDiagram(diagram);
    expect(mermaid).not.toContain("Sticky note for reviewers");

    const markdown = serializeMarkdownDiagram(diagram);
    expect(markdown).not.toContain("Sticky note for reviewers");
    expect(markdown).not.toContain("string note");
  });

  it("exports a compact detailed Mermaid flowchart", () => {
    const mermaid = serializeMermaidDiagram(createDiagram());

    expect(mermaid).toContain("flowchart LR");
    expect(mermaid).toContain("posts[");
    expect(mermaid).toContain("posts_2[");
    expect(mermaid).toContain("users[");
    expect(mermaid).not.toContain("node_");
    expect(mermaid).toContain(
      "PSQL table: posts",
    );
    expect(mermaid).toContain(
      "PK: id: uuid",
    );
    expect(mermaid).toContain(
      "REST resource: /posts",
    );
    expect(mermaid).toContain("description: Public article collection");
    expect(mermaid).not.toContain("descriptions:");
    expect(mermaid).toContain(
      '-->|"FK: author_id',
    );
  });

  it("exports Markdown with flowchart and ER Mermaid blocks", () => {
    const markdown = serializeMarkdownDiagram(createDiagram());

    expect(markdown).toContain("# Export Test");
    expect(markdown).toContain("## Relationship Flowchart");
    expect(markdown).toContain("```mermaid\nflowchart LR");
    expect(markdown).toContain("Public article collection");
    expect(markdown).toContain("Filter by publication status");
    expect(markdown).toContain("Current publication status");
    expect(markdown).toContain("## ER Diagram");
    expect(markdown).toContain("erDiagram");
    expect(markdown).toContain("POSTS {");
    expect(markdown).toContain("status_enum status");
    expect(markdown).not.toContain("PK; required; Current publication status");
    expect(markdown).toContain('POSTS ||--o{ POSTS_2 : "read: all"');
    expect(markdown).toContain('USERS ||--o{ POSTS_2 : "FK: author_id');
    expect(markdown).toContain("uuid id PK");
    expect(markdown).toContain("status_enum status UK");
    expect(markdown).toContain("author_id FK");
    expect(markdown).toContain("-> users.id");
    expect(markdown).toContain("INDEX btree (status)");
    expect(markdown).toContain("INDEX btree (author_id)");
    expect(markdown).toContain("maps posts.status");
    expect(markdown).toContain("resource_path");
    expect(markdown).toContain("http_methods");
    expect(markdown).toContain("## OpenAPI");
    expect(markdown).toContain('```json\n{\n  "openapi": "3.1.0"');
    expect(markdown).toContain('"title": "Export Test"');
    expect(markdown).toContain('"/posts":');
    expect(markdown).toContain('"get":');
    expect(markdown).toContain('"name": "status"');
    expect(markdown).toContain('"in": "query"');
    expect(markdown).toContain('"type": "array"');
    expect(markdown).toContain('"enum": [');
    expect(markdown).toContain('"draft"');
    expect(markdown).toContain('"required": [\n                      "status"\n                    ]');
    expect(markdown).toContain("## PostgreSQL Schema");
    expect(markdown).toContain("```sql\nCREATE TYPE \"status_enum\" AS ENUM ('draft', 'published');");
    const usersCreateIdx = markdown.indexOf('CREATE TABLE "users" (');
    const postsCreateIdx = markdown.indexOf('CREATE TABLE "posts" (');
    expect(usersCreateIdx).toBeGreaterThan(-1);
    expect(postsCreateIdx).toBeGreaterThan(-1);
    expect(usersCreateIdx).toBeLessThan(postsCreateIdx);
    expect(markdown).toContain("CREATE TABLE \"posts\" (");
    expect(markdown).toContain('"id" uuid NOT NULL DEFAULT gen_random_uuid()');
    expect(markdown).toContain(
      '"status" "status_enum" NOT NULL UNIQUE CHECK (true)',
    );
    expect(markdown).toContain('"author_id" integer NOT NULL');
    expect(markdown).toContain('PRIMARY KEY ("id")');
    expect(markdown).toContain('FOREIGN KEY ("author_id") REFERENCES "users" ("id")');
    expect(markdown).toContain('CREATE INDEX ON "posts" ("status");');
    expect(markdown).toContain('CREATE INDEX ON "posts" ("author_id");');
    expect(markdown).not.toContain("idx_posts");
  });

  it("OpenAPI: output.exclude removes fields from GET / response body schema", () => {
    const base = createDiagram();
    const diagram: Diagram = {
      ...base,
      nodes: base.nodes.map((node) => {
        if (node.data.kind !== "restResource") return node;
        return {
          ...node,
          data: {
            ...node.data,
            methods: node.data.methods.map((method) =>
              method.kind === "GET /"
                ? {
                    ...method,
                    output: { ...method.output, exclude: ["schema-field-1"] },
                  }
                : method,
            ) as RestResourceMethod[],
          },
        };
      }),
    };

    const markdown = serializeMarkdownDiagram(diagram);
    // All fields excluded → response schema falls back to open object (additionalProperties: true)
    // and the "properties" key is absent from the GET / items schema
    const openApiJson = JSON.parse(
      markdown.slice(
        markdown.indexOf("```json\n") + "```json\n".length,
        markdown.indexOf("\n```\n", markdown.indexOf("```json\n")),
      ),
    ) as Record<string, unknown>;
    const paths = openApiJson.paths as Record<string, Record<string, unknown>>;
    const getOp = paths["/posts"]?.["get"] as Record<string, unknown> | undefined;
    const response200 = (getOp?.responses as Record<string, unknown>)?.["200"] as
      | Record<string, unknown>
      | undefined;
    const responseSchema = (
      (response200?.content as Record<string, unknown>)?.["application/json"] as
        | Record<string, unknown>
        | undefined
    )?.schema as Record<string, unknown> | undefined;
    const itemsSchema = responseSchema?.items as Record<string, unknown> | undefined;
    // The excluded field's name ("status") should not appear as a property key
    expect(itemsSchema?.properties).toBeUndefined();
    expect(itemsSchema?.additionalProperties).toBe(true);
  });

  it("OpenAPI: isArray wraps field schema in { type: array, items: ... }", () => {
    const base = createDiagram();
    const diagram: Diagram = {
      ...base,
      nodes: base.nodes.map((node) => {
        if (node.data.kind !== "restResource") return node;
        return {
          ...node,
          data: {
            ...node.data,
            schema: node.data.schema.map((field) =>
              field.name === "status"
                ? ({ ...field, isArray: true } as ResourceSchemaField)
                : field,
            ),
          },
        };
      }),
    };

    const markdown = serializeMarkdownDiagram(diagram);
    const openApiSection = markdown.slice(markdown.indexOf("## OpenAPI"));
    // status field should now be an array type wrapping the original schema
    expect(openApiSection).toContain('"type": "array"');
  });

  it("OpenAPI: object field with sourceTableId inlines connected table columns", () => {
    const tableNode = {
      id: "table-meta",
      type: "psqlTable" as const,
      position: { x: 300, y: 0 },
      data: {
        kind: "psqlTable" as const,
        tableName: "post_meta",
        primaryKey: [],
        columns: [
          { id: "col-key", name: "key", type: "text" as const, nullable: false, unique: false },
          { id: "col-val", name: "value", type: "text" as const, nullable: true, unique: false },
        ],
        foreignKeys: [],
        indices: [],
      },
    };

    const objectField: ResourceSchemaField = {
      id: "sf-meta",
      name: "meta",
      type: "object",
      isArray: false,
      nullable: false,
      sourceTableId: "table-meta",
      sourceColumnId: "",
      exclude: [],
    };

    const base = createDiagram();
    const diagram: Diagram = {
      ...base,
      nodes: [
        ...base.nodes.map((node) => {
          if (node.data.kind !== "restResource") return node;
          return {
            ...node,
            data: {
              ...node.data,
              schema: [objectField],
            },
          };
        }),
        tableNode,
      ],
      edges: [
        ...base.edges,
        {
          id: "edge-meta",
          source: "resource-1",
          target: "table-meta",
          type: "smoothstep",
          data: { kind: "read" as const, dataPath: "all" },
        },
      ],
    };

    const markdown = serializeMarkdownDiagram(diagram);
    const openApiSection = markdown.slice(markdown.indexOf("## OpenAPI"));
    expect(openApiSection).toContain('"meta"');
    expect(openApiSection).toContain('"key"');
    expect(openApiSection).toContain('"value"');
  });

  it("OpenAPI: object field with sourceTableId and exclude omits listed columns", () => {
    const tableNode = {
      id: "table-meta",
      type: "psqlTable" as const,
      position: { x: 300, y: 0 },
      data: {
        kind: "psqlTable" as const,
        tableName: "post_meta",
        primaryKey: [],
        columns: [
          { id: "col-key", name: "key", type: "text" as const, nullable: false, unique: false },
          { id: "col-val", name: "value", type: "text" as const, nullable: true, unique: false },
        ],
        foreignKeys: [],
        indices: [],
      },
    };

    const objectField: ResourceSchemaField = {
      id: "sf-meta",
      name: "meta",
      type: "object",
      isArray: false,
      nullable: false,
      sourceTableId: "table-meta",
      sourceColumnId: "",
      exclude: ["col-val"],
    };

    const base = createDiagram();
    const diagram: Diagram = {
      ...base,
      nodes: [
        ...base.nodes.map((node) => {
          if (node.data.kind !== "restResource") return node;
          return {
            ...node,
            data: {
              ...node.data,
              schema: [objectField],
            },
          };
        }),
        tableNode,
      ],
      edges: [
        ...base.edges,
        {
          id: "edge-meta",
          source: "resource-1",
          target: "table-meta",
          type: "smoothstep",
          data: { kind: "read" as const, dataPath: "all" },
        },
      ],
    };

    const markdown = serializeMarkdownDiagram(diagram);
    const jsonStart = markdown.indexOf("```json\n", markdown.indexOf("## OpenAPI")) + "```json\n".length;
    const jsonEnd = markdown.indexOf("\n```\n", jsonStart);
    const openApiJson = JSON.parse(markdown.slice(jsonStart, jsonEnd)) as Record<string, unknown>;
    const paths = openApiJson.paths as Record<string, Record<string, unknown>>;
    const getOp = paths["/posts"]?.["get"] as Record<string, unknown>;
    const response200 = (getOp?.responses as Record<string, unknown>)?.["200"] as Record<string, unknown>;
    const responseSchema = ((response200?.content as Record<string, unknown>)?.["application/json"] as Record<string, unknown>)?.schema as Record<string, unknown>;
    const itemsSchema = responseSchema?.items as Record<string, unknown>;
    const metaProperties = (itemsSchema?.properties as Record<string, unknown>)?.["meta"] as Record<string, unknown>;
    const nestedProperties = metaProperties?.properties as Record<string, unknown> | undefined;

    expect(nestedProperties?.["key"]).toBeDefined();
    expect(nestedProperties?.["value"]).toBeUndefined();
  });
});
