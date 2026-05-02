import { describe, expect, it } from "vitest";
import {
  diagramSchema,
  edgeDataSchema,
  restResourceMethodSchema,
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
  });

  it("expands shorthand REST methods into full method contracts", () => {
    expect(restResourceMethodSchema.parse("GET /")).toEqual({
      id: "method-GET /",
      kind: "GET /",
      input: { mode: "query", fields: [] },
      output: { fields: ["all"], returnsArray: true },
    });
    expect(restResourceMethodSchema.parse("DELETE /{id}")).toEqual({
      id: "method-DELETE /{id}",
      kind: "DELETE /{id}",
      input: undefined,
      output: { fields: [], returnsArray: false },
    });
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
          output: { fields: ["all"], returnsArray: true },
        },
      ],
      schema: [],
    });
    expect(diagram.edges[0].data).toEqual({ kind: "write", dataPath: "all" });
  });
});
