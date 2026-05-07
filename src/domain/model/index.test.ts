import { describe, expect, it } from "vitest";
import { createDiagramNode, createStarterDiagram } from "../factories";
import {
  appViewInputHandleId,
  appViewEventSourceHandleId,
  appViewOnLoadSourceHandleId,
  psqlTableInputHandleId,
  restMethodSourceHandleId,
  restMethodTargetHandleId,
} from "../connectionEndpoints";
import type { Diagram, DiagramNode } from "../types";
import {
  AppViewBlock,
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

type AppViewNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "appView" }>;
};

type PsqlTableNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

const asAppViewNode = (node: DiagramNode): AppViewNode => {
  if (node.data.kind !== "appView") {
    throw new Error("Expected app view test node");
  }

  return node as AppViewNode;
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

  it("creates and clones AppView events", () => {
    const node = asAppViewNode(
      AppViewBlock.create({ x: 10, y: 20 }, { seed: true }).serialize(),
    );
    const clone = asAppViewNode(AppViewBlock.hydrate(node).clone().serialize());

    expect(node.type).toBe("appView");
    expect(node.data).toMatchObject({
      kind: "appView",
      viewName: "Items",
      route: "/items",
    });
    expect(clone.id).not.toBe(node.id);
    expect(clone.data.events).toHaveLength(node.data.events.length);
    expect(clone.data.events[0]?.id).not.toBe(node.data.events[0]?.id);
    expect(clone.data.events[0]?.name).toBe(node.data.events[0]?.name);
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
        unique: false,
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
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
      },
      {
        id: "self-fk",
        name: "self_ref",
        type: "uuid",
        nullable: true,
        targetTableId: source.id,
        targetColumnId: source.data.columns[0].id,
        onDelete: "NO ACTION",
        onUpdate: "NO ACTION",
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
      defaultValue: "get_random_uuid()",
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
      unique: false,
    });
    expect(createRestMethodInput()).toMatchObject({
      name: "",
      type: "string",
      mode: "payload",
    });
    expect(createPsqlIndex()).toMatchObject({
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
      onDelete: "NO ACTION",
      onUpdate: "NO ACTION",
    });
    expect(createPsqlEnum()).toMatchObject({
      name: "",
      values: [],
    });
  });
});

describe("connection model", () => {
  it("requires explicit endpoint handles for user-created connections", () => {
    const view = AppViewBlock.create({ x: 0, y: 0 });
    const resource = RestResourceBlock.create({ x: 100, y: 0 });
    const table = PsqlTableBlock.create({ x: 200, y: 0 });

    expect(getCompatibleConnectionKind(view, resource)).toBeNull();
    expect(getCompatibleConnectionKinds(view, resource)).toEqual([]);
    expect(getCompatibleConnectionKind(resource, table)).toBeNull();
    expect(getCompatibleConnectionKinds(resource, table)).toEqual([]);
    expect(getCompatibleConnectionKind(table, resource)).toBeNull();
    expect(getCompatibleConnectionKinds(table, resource)).toEqual([]);
  });

  it("validates connections through endpoint handles", () => {
    const source = asAppViewNode(createDiagramNode("appView", { x: 0, y: 0 }));
    const target = asAppViewNode(createDiagramNode("appView", { x: 200, y: 0 }));
    source.data.events = [{ id: "event-next", name: "onClick::Next" }];
    const resource = asRestResourceNode(
      createDiagramNode("restResource", { x: 100, y: 0 }, { seed: true }),
    );
    const table = createDiagramNode("psqlTable", { x: 200, y: 0 });
    const getMethod = resource.data.methods.find((method) => method.kind === "GET /");

    if (!getMethod) {
      throw new Error("Expected seeded GET method");
    }

    expect(
      getCompatibleConnectionKind(
        AppViewBlock.hydrate(source),
        RestResourceBlock.hydrate(resource),
        appViewOnLoadSourceHandleId(),
        restMethodTargetHandleId(getMethod.id),
      ),
    ).toBe("read");
    expect(
      getCompatibleConnectionKind(
        AppViewBlock.hydrate(source),
        AppViewBlock.hydrate(target),
        appViewEventSourceHandleId("event-next"),
        appViewInputHandleId(),
      ),
    ).toBe("navigate");
    expect(
      getCompatibleConnectionKind(
        RestResourceBlock.hydrate(resource),
        PsqlTableBlock.hydrate(table),
        restMethodSourceHandleId(getMethod.id),
        psqlTableInputHandleId(),
      ),
    ).toBe("read");
    expect(
      getCompatibleConnectionKinds(
        RestResourceBlock.hydrate(resource),
        PsqlTableBlock.hydrate(table),
        restMethodSourceHandleId(getMethod.id),
        psqlTableInputHandleId(),
      ),
    ).toEqual(["read"]);
    expect(
      getCompatibleConnectionKind(
        AppViewBlock.hydrate(source),
        AppViewBlock.hydrate(target),
        appViewOnLoadSourceHandleId(),
        appViewInputHandleId(),
      ),
    ).toBeNull();
  });

  it("creates valid endpoint edges and rejects duplicates", () => {
    const resource = asRestResourceNode(
      createDiagramNode("restResource", { x: 100, y: 0 }, { seed: true }),
    );
    const table = createDiagramNode("psqlTable", { x: 200, y: 0 });
    const getMethod = resource.data.methods.find((method) => method.kind === "GET /");

    if (!getMethod) {
      throw new Error("Expected seeded GET method");
    }

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
    const connection = model.createConnection(
      resource.id,
      table.id,
      restMethodSourceHandleId(getMethod.id),
      psqlTableInputHandleId(),
    );

    expect(connection?.serialize()).toMatchObject({
      source: resource.id,
      sourceHandle: restMethodSourceHandleId(getMethod.id),
      target: table.id,
      targetHandle: psqlTableInputHandleId(),
      type: "smoothstep",
      data: { kind: "read", dataPath: "all" },
    });

    const modelWithConnection = DiagramModel.hydrate({
      ...diagram,
      edges: connection ? [connection.serialize()] : [],
    });

    expect(
      modelWithConnection.createConnection(
        resource.id,
        table.id,
        restMethodSourceHandleId(getMethod.id),
        psqlTableInputHandleId(),
      ),
    ).toBeNull();
  });

  it("connects AppView onLoad and events to REST method handles", () => {
    const view = asAppViewNode(createDiagramNode("appView", { x: 0, y: 0 }));
    const resource = asRestResourceNode(
      createDiagramNode("restResource", { x: 200, y: 0 }, { seed: true }),
    );
    view.data.events = [{ id: "event-submit", name: "onClick::Submit" }];
    const getMethod = resource.data.methods.find((method) => method.kind === "GET /");
    const postMethod = resource.data.methods.find(
      (method) => method.kind === "POST /",
    );

    if (!getMethod || !postMethod) {
      throw new Error("Expected seeded REST methods");
    }

    const diagram: Diagram = {
      id: "diagram-1",
      name: "Test diagram",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      psqlEnums: [],
      nodes: [view, resource],
      edges: [],
    };
    const model = DiagramModel.hydrate(diagram);

    expect(
      model
        .createConnection(
          view.id,
          resource.id,
          appViewOnLoadSourceHandleId(),
          restMethodTargetHandleId(getMethod.id),
        )
        ?.serialize(),
    ).toMatchObject({
      source: view.id,
      sourceHandle: appViewOnLoadSourceHandleId(),
      target: resource.id,
      targetHandle: restMethodTargetHandleId(getMethod.id),
      data: { kind: "read", dataPath: "all" },
    });
    expect(
      model
        .createConnection(
          view.id,
          resource.id,
          appViewEventSourceHandleId("event-submit"),
          restMethodTargetHandleId(postMethod.id),
        )
        ?.serialize(),
    ).toMatchObject({
      data: { kind: "write", dataPath: "all" },
    });
  });

  it("connects REST method source handles to PSQL tables", () => {
    const resource = asRestResourceNode(
      createDiagramNode("restResource", { x: 0, y: 0 }, { seed: true }),
    );
    const table = createDiagramNode("psqlTable", { x: 200, y: 0 });
    const getMethod = resource.data.methods.find((method) => method.kind === "GET /");
    const postMethod = resource.data.methods.find(
      (method) => method.kind === "POST /",
    );

    if (!getMethod || !postMethod) {
      throw new Error("Expected seeded REST methods");
    }

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

    expect(
      model
        .createConnection(
          resource.id,
          table.id,
          restMethodSourceHandleId(getMethod.id),
          psqlTableInputHandleId(),
        )
        ?.serialize(),
    ).toMatchObject({
      source: resource.id,
      sourceHandle: restMethodSourceHandleId(getMethod.id),
      target: table.id,
      data: { kind: "read", dataPath: "all" },
    });
    expect(
      model
        .createConnection(
          resource.id,
          table.id,
          restMethodSourceHandleId(postMethod.id),
          psqlTableInputHandleId(),
        )
        ?.serialize(),
    ).toMatchObject({
      data: { kind: "write", dataPath: "all" },
    });
  });

  it("connects AppView events to other AppViews as navigation", () => {
    const source = asAppViewNode(createDiagramNode("appView", { x: 0, y: 0 }));
    const target = asAppViewNode(createDiagramNode("appView", { x: 200, y: 0 }));
    source.data.events = [{ id: "event-next", name: "onClick::Next" }];
    const diagram: Diagram = {
      id: "diagram-1",
      name: "Test diagram",
      createdAt: "2026-05-02T00:00:00.000Z",
      updatedAt: "2026-05-02T00:00:00.000Z",
      psqlEnums: [],
      nodes: [source, target],
      edges: [],
    };
    const model = DiagramModel.hydrate(diagram);

    expect(
      model
        .createConnection(
          source.id,
          target.id,
          appViewEventSourceHandleId("event-next"),
          appViewInputHandleId(),
        )
        ?.serialize(),
    ).toMatchObject({
      data: { kind: "navigate", dataPath: "all" },
    });
    expect(
      model.createConnection(
        source.id,
        target.id,
        appViewOnLoadSourceHandleId(),
        appViewInputHandleId(),
      ),
    ).toBeNull();
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

  it("preserves annotations while excluding them from block export specs", () => {
    const starter = createStarterDiagram();
    const diagram: Diagram = {
      ...starter,
      nodes: [
        ...starter.nodes,
        createDiagramNode("annotation", { x: 10, y: 20 }),
      ],
    };
    const model = hydrateDiagram(diagram);

    expect(serializeDiagram(model).nodes).toHaveLength(diagram.nodes.length);
    expect(serializeDiagram(model).nodes.at(-1)?.data.kind).toBe("annotation");
    expect(model.toMermaidSpecs().blocks).toHaveLength(diagram.nodes.length - 1);
  });
});
