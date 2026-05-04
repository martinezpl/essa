import { describe, expect, it } from "vitest";
import { createDiagramNode, createStarterDiagram } from "../factories";
import type { Diagram, DiagramNode } from "../types";
import {
  DiagramModel,
  RestResourceBlock,
  PsqlTableBlock,
  createResourceSchemaField,
  createRestMethodInput,
  createRestResourceMethodContract,
  createPsqlColumn,
  createPsqlEnum,
  createPsqlForeignKey,
  createPsqlIndex,
  getCompatibleConnectionKind,
  getCompatibleConnectionKinds,
  hydrateDiagram,
  serializeDiagram,
} from "./index";

type RestResourceNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "restResource" }>;
};

type PsqlTableNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

const asRestResourceNode = (node: DiagramNode): RestResourceNode => {
  if (node.data.kind !== "restResource") {
    throw new Error("Expected rest resource test node");
  }

  return node as RestResourceNode;
};

const asPsqlTableNode = (node: DiagramNode): PsqlTableNode => {
  if (node.data.kind !== "psqlTable") {
    throw new Error("Expected PSQL table test node");
  }

  return node as PsqlTableNode;
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

  it("preserves external foreign keys and drops self references when cloning PSQL tables", () => {
    const source = asPsqlTableNode(createDiagramNode("psqlTable", { x: 0, y: 0 }));
    const target = asPsqlTableNode(createDiagramNode("psqlTable", { x: 100, y: 0 }));
    const targetPrimaryKey = target.data.columns[0];
    source.data.columns = [
      source.data.columns[0],
      {
        id: "self-reference",
        name: "parent_id",
        type: "uuid",
        nullable: true,
      },
    ];
    source.data.foreignKeys = [
      {
        id: "external-fk",
        name: "ref_id",
        type: "uuid",
        nullable: false,
        targetTableId: target.id,
        targetColumnId: targetPrimaryKey.id,
      },
      {
        id: "self-fk",
        name: "self_ref",
        type: "uuid",
        nullable: true,
        targetTableId: source.id,
        targetColumnId: source.data.columns[0].id,
      },
    ];

    const clone = asPsqlTableNode(PsqlTableBlock.hydrate(source).clone().serialize());

    expect(clone.data.columns[0].id).not.toBe(source.data.columns[0].id);
    expect(clone.data.foreignKeys).toHaveLength(1);
    expect(clone.data.foreignKeys[0]).toMatchObject({
      name: "ref_id",
      type: "uuid",
      nullable: false,
      targetTableId: target.id,
      targetColumnId: targetPrimaryKey.id,
    });
  });

  it("creates new PSQL tables with an id UUID primary key", () => {
    const table = asPsqlTableNode(createDiagramNode("psqlTable", { x: 0, y: 0 }));

    expect(table.data.columns[0]).toMatchObject({
      name: "id",
      type: "uuid",
      nullable: false,
    });
    expect(table.data.primaryKey).toEqual([table.data.columns[0].id]);
  });

  it("creates REST method contracts from method kind defaults", () => {
    expect(createRestResourceMethodContract("POST /")).toMatchObject({
      kind: "POST /",
      input: [],
      output: { returnsArray: false },
    });
    expect(createRestResourceMethodContract("GET /")).toMatchObject({
      kind: "GET /",
      input: [],
      output: { returnsArray: true },
    });
    expect(createRestResourceMethodContract("DELETE /{id}")).toMatchObject({
      kind: "DELETE /{id}",
      input: [],
      output: { returnsArray: false },
    });
  });

  it("creates child defaults from block classes", () => {
    expect(createResourceSchemaField()).toMatchObject({
      name: "",
      type: "string",
      nullable: false,
      sourceTableId: "",
      sourceColumnId: "",
    });
    expect(createPsqlColumn()).toMatchObject({
      name: "",
      type: "text",
      nullable: false,
    });
    expect(createRestMethodInput()).toMatchObject({
      name: "",
      type: "string",
      mode: "payload",
    });
    expect(createPsqlIndex()).toMatchObject({
      name: "",
      columns: [],
      method: "btree",
      unique: false,
    });
    expect(createPsqlForeignKey()).toMatchObject({
      name: "",
      type: "uuid",
      nullable: false,
      targetTableId: "",
      targetColumnId: "",
    });
    expect(createPsqlEnum()).toMatchObject({
      name: "",
      values: [],
    });
  });
});

describe("connection model", () => {
  it("validates connections through block ports", () => {
    const resource = RestResourceBlock.create({ x: 100, y: 0 });
    const table = PsqlTableBlock.create({ x: 200, y: 0 });

    expect(getCompatibleConnectionKind(resource, table)).toBe("read");
    expect(getCompatibleConnectionKinds(resource, table)).toEqual([
      "read",
      "write",
      "read/write",
    ]);
    expect(getCompatibleConnectionKind(table, resource)).toBeNull();
    expect(getCompatibleConnectionKinds(table, resource)).toEqual([]);
  });

  it("creates valid edges and rejects duplicates", () => {
    const resource = createDiagramNode("restResource", { x: 100, y: 0 });
    const table = createDiagramNode("psqlTable", { x: 200, y: 0 });
    const diagram: Diagram = {
      id: "diagram-1",
      name: "Test diagram",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      psqlEnums: [],
      nodes: [resource, table],
      edges: [],
    };
    const model = DiagramModel.hydrate(diagram);
    const connection = model.createConnection(resource.id, table.id);

    expect(connection?.serialize()).toMatchObject({
      source: resource.id,
      target: table.id,
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    });

    const modelWithConnection = DiagramModel.hydrate({
      ...diagram,
      edges: connection ? [connection.serialize()] : [],
    });

    expect(modelWithConnection.createConnection(resource.id, table.id)).toBeNull();
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

    expect(model.toMermaidSpecs().blocks).toHaveLength(4);
    expect(model.toMermaidSpecs().connections).toHaveLength(2);
    expect(model.toOpenApiSpecs()).toHaveLength(2);
    expect(model.toPsqlSpecs()).toHaveLength(2);
  });
});
