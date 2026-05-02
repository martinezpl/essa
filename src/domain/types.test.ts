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
    expect(diagram.edges[0].data).toEqual({ kind: "write", dataPath: "all" });
  });
});
