import { describe, expect, it } from "vitest";
import {
  createDiagramShareHash,
  decodeDiagramSharePayload,
  encodeDiagramSharePayload,
  parseDiagramShareHash,
} from "./diagramShare";
import type { Diagram } from "./types";

const createDiagram = (): Diagram => ({
  id: "diagram-share",
  name: "Shared Diagram",
  createdAt: "2026-05-04T00:00:00.000Z",
  updatedAt: "2026-05-04T00:00:00.000Z",
  psqlEnums: [
    {
      id: "enum-status",
      name: "status_enum",
      values: ["draft", "published"],
    },
  ],
  nodes: [
    {
      id: "table-posts",
      type: "psqlTable",
      position: { x: 120, y: 160 },
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
            unique: false,
          },
        ],
        foreignKeys: [],
        indices: [
          {
            id: "index-status",
            name: "idx_posts_status",
            columns: ["column-status"],
            method: "btree",
            unique: false,
          },
        ],
      },
    },
  ],
  edges: [],
});

describe("diagram share links", () => {
  it("round-trips a diagram through the compressed share payload", () => {
    const diagram = createDiagram();

    expect(decodeDiagramSharePayload(encodeDiagramSharePayload(diagram))).toEqual(
      diagram,
    );
  });

  it("emits a URL-safe hash fragment", () => {
    const hash = createDiagramShareHash(createDiagram());
    const payload = hash.replace(/^share=/, "");

    expect(hash.startsWith("share=")).toBe(true);
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("parses share payloads from hash fragments", () => {
    const diagram = createDiagram();

    expect(parseDiagramShareHash(`#${createDiagramShareHash(diagram)}`)).toEqual(
      diagram,
    );
    expect(parseDiagramShareHash("#other=value")).toBeNull();
  });

  it("rejects invalid share payloads", () => {
    expect(() => decodeDiagramSharePayload("not-a-valid-payload")).toThrow();
  });
});
