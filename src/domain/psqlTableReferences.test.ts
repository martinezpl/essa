import { describe, expect, it } from "vitest";
import type { Diagram, DiagramEdge, DiagramNode, PsqlTableData } from "./types";
import {
  reconcileDiagramAfterPsqlColumnsChange,
  reconcileDiagramAfterPsqlTableRemoved,
  reconcileDiagramForPsqlTableNode,
  reconcilePsqlTableData,
} from "./psqlTableReferences";

describe("reconcilePsqlTableData", () => {
  it("drops primary key and index entries that no longer reference a column or FK row", () => {
    const data = {
      kind: "psqlTable" as const,
      tableName: "t",
      primaryKey: ["col-1", "ghost-pk", "fk-1"],
      columns: [
        { id: "col-1", name: "a", type: "text" as const, nullable: false, unique: false },
      ],
      foreignKeys: [
        {
          id: "fk-1",
          name: "ref",
          type: "uuid" as const,
          nullable: false,
          targetTableId: "other",
          targetColumnId: "x",
          onDelete: "NO ACTION" as const,
          onUpdate: "NO ACTION" as const,
        },
      ],
      indices: [
        {
          id: "idx-1",
          name: "i",
          columns: ["col-1", "ghost-idx"],
          method: "btree" as const,
          unique: false,
        },
      ],
    };

    const next = reconcilePsqlTableData(data);

    expect(next.primaryKey).toEqual(["col-1", "fk-1"]);
    expect(next.indices[0].columns).toEqual(["col-1"]);
  });
});

const baseDiagram = (nodes: DiagramNode[], edges: DiagramEdge[] = []): Diagram => ({
  id: "d1",
  name: "Test",
  createdAt: "2026-05-02T00:00:00.000Z",
  updatedAt: "2026-05-02T00:00:00.000Z",
  psqlEnums: [],
  nodes,
  edges,
});

describe("reconcileDiagramAfterPsqlColumnsChange", () => {
  it("removes foreign keys on other tables that pointed at a deleted target column", () => {
    const users: DiagramNode = {
      id: "users",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "users",
        primaryKey: ["u-id"],
        columns: [{ id: "u-id", name: "id", type: "uuid", nullable: false, unique: false }],
        foreignKeys: [],
        indices: [],
      },
    };

    const posts: DiagramNode = {
      id: "posts",
      type: "psqlTable",
      position: { x: 100, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "posts",
        primaryKey: ["p-id"],
        columns: [
          { id: "p-id", name: "id", type: "uuid", nullable: false, unique: false },
          { id: "p-author", name: "author_id", type: "uuid", nullable: false, unique: false },
        ],
        foreignKeys: [
          {
            id: "fk-author",
            name: "author_id",
            type: "uuid",
            nullable: false,
            targetTableId: "users",
            targetColumnId: "u-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
        ],
        indices: [],
      },
    };

    const diagram = baseDiagram([users, posts]);

    const usersData = users.data as PsqlTableData;
    const mergedUsers: PsqlTableData = {
      ...usersData,
      columns: [],
    };

    const intermediate: Diagram = {
      ...diagram,
      nodes: diagram.nodes.map((node) =>
        node.id === "users" ? { ...node, data: mergedUsers } : node,
      ),
    };

    const next = reconcileDiagramAfterPsqlColumnsChange({
      diagram: intermediate,
      tableNodeId: "users",
      previousColumns: usersData.columns,
      mergedTableData: mergedUsers,
    });

    const postsNext = next.nodes.find((n) => n.id === "posts");
    expect(postsNext?.data.kind).toBe("psqlTable");
    if (postsNext?.data.kind === "psqlTable") {
      expect(postsNext.data.foreignKeys).toHaveLength(0);
    }
  });

  it("syncs foreign key type when the referenced column type changes", () => {
    const users: DiagramNode = {
      id: "users",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "users",
        primaryKey: ["u-id"],
        columns: [{ id: "u-id", name: "id", type: "bigint", nullable: false, unique: false }],
        foreignKeys: [],
        indices: [],
      },
    };

    const posts: DiagramNode = {
      id: "posts",
      type: "psqlTable",
      position: { x: 100, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "posts",
        primaryKey: ["p-id"],
        columns: [{ id: "p-id", name: "id", type: "uuid", nullable: false, unique: false }],
        foreignKeys: [
          {
            id: "fk-author",
            name: "author_id",
            type: "uuid",
            nullable: false,
            targetTableId: "users",
            targetColumnId: "u-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
        ],
        indices: [],
      },
    };

    const previousColumns = [
      { id: "u-id", name: "id", type: "uuid" as const, nullable: false, unique: false },
    ];

    const mergedUsers: PsqlTableData = {
      ...(users.data as PsqlTableData),
      columns: [
        { id: "u-id", name: "id", type: "bigint" as const, nullable: false, unique: false },
      ],
    };

    const diagram = baseDiagram([users, posts]);
    const intermediate: Diagram = {
      ...diagram,
      nodes: diagram.nodes.map((node) =>
        node.id === "users" ? { ...node, data: mergedUsers } : node,
      ),
    };

    const next = reconcileDiagramAfterPsqlColumnsChange({
      diagram: intermediate,
      tableNodeId: "users",
      previousColumns,
      mergedTableData: mergedUsers,
    });

    const postsNext = next.nodes.find((n) => n.id === "posts");
    expect(postsNext?.data.kind).toBe("psqlTable");
    if (postsNext?.data.kind === "psqlTable") {
      expect(postsNext.data.foreignKeys[0].type).toBe("bigint");
    }
  });

  it("removes REST schema fields tied to a removed column", () => {
    const table: DiagramNode = {
      id: "t1",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "items",
        primaryKey: ["c1"],
        columns: [
          { id: "c1", name: "id", type: "uuid", nullable: false, unique: false },
          { id: "c2", name: "price", type: "numeric", nullable: true, unique: false },
        ],
        foreignKeys: [],
        indices: [],
      },
    };

    const resource: DiagramNode = {
      id: "r1",
      type: "restResource",
      position: { x: 0, y: 100 },
      data: {
        kind: "restResource",
        resourceName: "items",
        methods: [],
        schema: [
          {
            id: "sf1",
            name: "price",
            type: "number",
            isArray: false,
            nullable: true,
            sourceTableId: "t1",
            sourceColumnId: "c2",
            exclude: [],
          },
        ],
      },
    };

    const diagram = baseDiagram([table, resource]);
    const tableData = table.data as PsqlTableData;
    const mergedTable: PsqlTableData = {
      ...tableData,
      columns: [tableData.columns[0]],
    };

    const intermediate: Diagram = {
      ...diagram,
      nodes: diagram.nodes.map((node) =>
        node.id === "t1" ? { ...node, data: mergedTable } : node,
      ),
    };

    const next = reconcileDiagramAfterPsqlColumnsChange({
      diagram: intermediate,
      tableNodeId: "t1",
      previousColumns: tableData.columns,
      mergedTableData: mergedTable,
    });

    const resourceNext = next.nodes.find((n) => n.id === "r1");
    expect(resourceNext?.data.kind).toBe("restResource");
    if (resourceNext?.data.kind === "restResource") {
      expect(resourceNext.data.schema).toHaveLength(0);
    }
  });

  it("resets edge dataPath when the named column no longer exists", () => {
    const table: DiagramNode = {
      id: "t1",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "items",
        primaryKey: ["c1"],
        columns: [
          { id: "c1", name: "id", type: "uuid", nullable: false, unique: false },
          { id: "c2", name: "price", type: "numeric", nullable: true, unique: false },
        ],
        foreignKeys: [],
        indices: [],
      },
    };

    const resource: DiagramNode = {
      id: "r1",
      type: "restResource",
      position: { x: 0, y: 100 },
      data: {
        kind: "restResource",
        resourceName: "items",
        methods: [],
        schema: [],
      },
    };

    const edge: DiagramEdge = {
      id: "e1",
      source: "r1",
      target: "t1",
      type: "smoothstep",
      data: { kind: "read", dataPath: "price" },
    };

    const diagram = baseDiagram([table, resource], [edge]);
    const tableDataEdge = table.data as PsqlTableData;
    const mergedTable: PsqlTableData = {
      ...tableDataEdge,
      columns: [tableDataEdge.columns[0]],
    };

    const intermediate: Diagram = {
      ...diagram,
      nodes: diagram.nodes.map((node) =>
        node.id === "t1" ? { ...node, data: mergedTable } : node,
      ),
    };

    const next = reconcileDiagramAfterPsqlColumnsChange({
      diagram: intermediate,
      tableNodeId: "t1",
      previousColumns: tableDataEdge.columns,
      mergedTableData: mergedTable,
    });

    expect(next.edges[0].data.dataPath).toBe("all");
  });

  it("preserves edge dataPath when all selected column names still exist", () => {
    const table: DiagramNode = {
      id: "t1",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "items",
        primaryKey: ["c1"],
        columns: [
          { id: "c1", name: "id", type: "uuid", nullable: false, unique: false },
          { id: "c2", name: "price", type: "numeric", nullable: true, unique: false },
        ],
        foreignKeys: [],
        indices: [],
      },
    };

    const resource: DiagramNode = {
      id: "r1",
      type: "restResource",
      position: { x: 0, y: 100 },
      data: {
        kind: "restResource",
        resourceName: "items",
        methods: [],
        schema: [],
      },
    };

    const edge: DiagramEdge = {
      id: "e1",
      source: "r1",
      target: "t1",
      type: "smoothstep",
      data: { kind: "write", dataPath: "id, price" },
    };

    const diagram = baseDiagram([table, resource], [edge]);
    const tableDataEdge = table.data as PsqlTableData;

    const next = reconcileDiagramAfterPsqlColumnsChange({
      diagram,
      tableNodeId: "t1",
      previousColumns: tableDataEdge.columns,
      mergedTableData: tableDataEdge,
    });

    expect(next.edges[0].data.dataPath).toBe("id, price");
  });
});

describe("reconcileDiagramAfterPsqlTableRemoved", () => {
  it("strips foreign keys and resource schema references to the removed table", () => {
    const users: DiagramNode = {
      id: "users",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "users",
        primaryKey: ["u-id"],
        columns: [{ id: "u-id", name: "id", type: "uuid", nullable: false, unique: false }],
        foreignKeys: [],
        indices: [],
      },
    };

    const posts: DiagramNode = {
      id: "posts",
      type: "psqlTable",
      position: { x: 100, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "posts",
        primaryKey: ["p-id"],
        columns: [{ id: "p-id", name: "id", type: "uuid", nullable: false, unique: false }],
        foreignKeys: [
          {
            id: "fk",
            name: "author_id",
            type: "uuid",
            nullable: false,
            targetTableId: "users",
            targetColumnId: "u-id",
            onDelete: "NO ACTION",
            onUpdate: "NO ACTION",
          },
        ],
        indices: [],
      },
    };

    const resource: DiagramNode = {
      id: "r1",
      type: "restResource",
      position: { x: 0, y: 100 },
      data: {
        kind: "restResource",
        resourceName: "users",
        methods: [],
        schema: [
          {
            id: "sf",
            name: "id",
            type: "string",
            isArray: false,
            nullable: false,
            sourceTableId: "users",
            sourceColumnId: "u-id",
            exclude: [],
          },
        ],
      },
    };

    let diagram = baseDiagram([users, posts, resource]);
    diagram = {
      ...diagram,
      nodes: diagram.nodes.filter((n) => n.id !== "users"),
    };

    const next = reconcileDiagramAfterPsqlTableRemoved(diagram, "users");

    const postsNext = next.nodes.find((n) => n.id === "posts");
    expect(postsNext?.data.kind).toBe("psqlTable");
    if (postsNext?.data.kind === "psqlTable") {
      expect(postsNext.data.foreignKeys).toHaveLength(0);
    }

    const resourceNext = next.nodes.find((n) => n.id === "r1");
    expect(resourceNext?.data.kind).toBe("restResource");
    if (resourceNext?.data.kind === "restResource") {
      expect(resourceNext.data.schema).toHaveLength(0);
    }
  });
});

describe("reconcileDiagramForPsqlTableNode", () => {
  it("cleans primary key when only primaryKey patch is applied via merge path", () => {
    const table: DiagramNode = {
      id: "t1",
      type: "psqlTable",
      position: { x: 0, y: 0 },
      data: {
        kind: "psqlTable",
        tableName: "t",
        primaryKey: ["c1", "ghost"],
        columns: [{ id: "c1", name: "id", type: "uuid", nullable: false, unique: false }],
        foreignKeys: [],
        indices: [],
      },
    };

    const diagram = baseDiagram([table]);
    const merged: PsqlTableData = {
      ...(table.data as PsqlTableData),
      primaryKey: ["c1", "ghost"],
    };
    const intermediate: Diagram = {
      ...diagram,
      nodes: [{ ...table, data: merged }],
    };

    const next = reconcileDiagramForPsqlTableNode(intermediate, "t1", merged);
    const t = next.nodes[0];
    expect(t?.data.kind).toBe("psqlTable");
    if (t?.data.kind === "psqlTable") {
      expect(t.data.primaryKey).toEqual(["c1"]);
    }
  });
});
