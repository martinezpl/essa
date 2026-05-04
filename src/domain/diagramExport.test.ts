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
import type { Diagram } from "./types";

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
            output: { returnsArray: true },
          },
        ],
        schema: [
          {
            id: "schema-field-1",
            name: "status",
            type: "string",
            enum: ["draft", "published"],
            nullable: false,
            sourceTableId: "table-posts",
            sourceColumnId: "column-status",
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
            name: "idx_posts_status",
            columns: ["column-status"],
            method: "btree",
            unique: false,
          },
          {
            id: "index-fk-author",
            name: "idx_posts_author_fk",
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
    expect(markdown).toContain('"author_id" uuid NOT NULL');
    expect(markdown).toContain('PRIMARY KEY ("id")');
    expect(markdown).toContain('FOREIGN KEY ("author_id") REFERENCES "users" ("id")');
    expect(markdown).toContain('CREATE INDEX "idx_posts_status" ON "posts" ("status");');
    expect(markdown).toContain(
      'CREATE INDEX "idx_posts_author_fk" ON "posts" ("author_id");',
    );
  });
});
