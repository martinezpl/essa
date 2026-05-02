import { describe, expect, it } from "vitest";
import { createDiagramNode, createStarterDiagram } from "../factories";
import type { Diagram, DiagramNode } from "../types";
import {
  AppViewBlock,
  DiagramModel,
  RestResourceBlock,
  SqlTableBlock,
  createRestResourceMethodContract,
  getCompatibleConnectionKind,
  hydrateDiagram,
  serializeDiagram,
} from "./index";

type RestResourceNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "restResource" }>;
};

const asRestResourceNode = (node: DiagramNode): RestResourceNode => {
  if (node.data.kind !== "restResource") {
    throw new Error("Expected rest resource test node");
  }

  return node as RestResourceNode;
};

describe("block model", () => {
  it("serializes blocks back to their existing DTO shape", () => {
    const block = RestResourceBlock.create({ x: 10, y: 20 }, { seed: true });
    const serialized = block.serialize();

    expect(serialized.type).toBe("restResource");
    expect(serialized.position).toEqual({ x: 10, y: 20 });
    expect(serialized.data).toMatchObject({
      kind: "restResource",
      resourceName: "items",
    });
    const restResourceNode = asRestResourceNode(serialized);
    expect(restResourceNode.data.methods.map((method) => method.kind)).toEqual([
      "POST /",
      "GET /",
      "GET /{id}",
    ]);
  });

  it("clones child collections with fresh ids", () => {
    const node = createDiagramNode("restResource", { x: 0, y: 0 }, { seed: true });
    const clone = RestResourceBlock.hydrate(node).clone().serialize();

    expect(clone.id).not.toBe(node.id);
    expect(clone.position).toEqual({ x: 48, y: 48 });

    const restResourceNode = asRestResourceNode(node);
    const clonedRestResourceNode = asRestResourceNode(clone);

    expect(clonedRestResourceNode.data.methods).toHaveLength(
      restResourceNode.data.methods.length,
    );
    clonedRestResourceNode.data.methods.forEach((method, index) => {
      expect(method.kind).toBe(restResourceNode.data.methods[index].kind);
      expect(method.id).not.toBe(restResourceNode.data.methods[index].id);
    });
  });

  it("creates REST method contracts from method kind defaults", () => {
    expect(createRestResourceMethodContract("POST /")).toMatchObject({
      kind: "POST /",
      input: { mode: "payload", fields: ["all"] },
      output: { fields: ["all"], returnsArray: false },
    });
    expect(createRestResourceMethodContract("GET /")).toMatchObject({
      kind: "GET /",
      input: { mode: "query", fields: [] },
      output: { fields: ["all"], returnsArray: true },
    });
    expect(createRestResourceMethodContract("DELETE /{id}")).toMatchObject({
      kind: "DELETE /{id}",
      input: undefined,
      output: { fields: [], returnsArray: false },
    });
  });
});

describe("connection model", () => {
  it("validates connections through block ports", () => {
    const appView = AppViewBlock.create({ x: 0, y: 0 });
    const resource = RestResourceBlock.create({ x: 100, y: 0 });
    const table = SqlTableBlock.create({ x: 200, y: 0 });

    expect(getCompatibleConnectionKind(appView, resource)).toBe("read");
    expect(getCompatibleConnectionKind(resource, table)).toBe("read");
    expect(getCompatibleConnectionKind(table, resource)).toBe("write");
    expect(getCompatibleConnectionKind(appView, table)).toBeNull();
    expect(getCompatibleConnectionKind(resource, appView)).toBeNull();
  });

  it("creates valid edges and rejects duplicates", () => {
    const appView = createDiagramNode("appView", { x: 0, y: 0 });
    const resource = createDiagramNode("restResource", { x: 100, y: 0 });
    const diagram: Diagram = {
      id: "diagram-1",
      name: "Test diagram",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      nodes: [appView, resource],
      edges: [],
    };
    const model = DiagramModel.hydrate(diagram);
    const connection = model.createConnection(appView.id, resource.id);

    expect(connection?.serialize()).toMatchObject({
      source: appView.id,
      target: resource.id,
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    });

    const modelWithConnection = DiagramModel.hydrate({
      ...diagram,
      edges: connection ? [connection.serialize()] : [],
    });

    expect(modelWithConnection.createConnection(appView.id, resource.id)).toBeNull();
  });
});

describe("diagram model", () => {
  it("round-trips diagrams through hydrate and serialize", () => {
    const diagram = createStarterDiagram();
    const model = hydrateDiagram(diagram);

    expect(serializeDiagram(model)).toEqual(diagram);
  });

  it("collects intermediate export specs", () => {
    const model = hydrateDiagram(createStarterDiagram());

    expect(model.toMermaidSpecs().blocks).toHaveLength(3);
    expect(model.toMermaidSpecs().connections).toHaveLength(1);
    expect(model.toOpenApiSpecs()).toHaveLength(1);
    expect(model.toSqlSpecs()).toHaveLength(1);
  });
});
