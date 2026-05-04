import { describe, expect, it } from "vitest";
import type { DiagramEdge, DiagramNode } from "../domain/types";
import { duplicateDiagramSelection } from "./useDiagramStore";

const usersTable: DiagramNode = {
  id: "users",
  type: "psqlTable",
  position: { x: 0, y: 0 },
  data: {
    kind: "psqlTable",
    tableName: "users",
    columns: [
      {
        id: "users-id",
        name: "id",
        type: "uuid",
        nullable: false,
        primaryKey: true,
      },
    ],
    foreignKeys: [],
    indices: [],
  },
};

const postsTable: DiagramNode = {
  id: "posts",
  type: "psqlTable",
  position: { x: 400, y: 0 },
  data: {
    kind: "psqlTable",
    tableName: "posts",
    columns: [
      {
        id: "posts-id",
        name: "id",
        type: "uuid",
        nullable: false,
        primaryKey: true,
      },
      {
        id: "posts-author",
        name: "author_id",
        type: "uuid",
        nullable: false,
        primaryKey: false,
      },
    ],
    foreignKeys: [
      {
        id: "posts-author-fk",
        name: "author_id",
        type: "uuid",
        nullable: false,
        primaryKey: false,
        targetTableId: "users",
        targetColumnId: "users-id",
      },
    ],
    indices: [],
  },
};

const edge: DiagramEdge = {
  id: "edge-posts-users",
  source: "posts",
  target: "users",
  data: { kind: "read", dataPath: "all" },
};

describe("duplicateDiagramSelection", () => {
  it("drops foreign keys that would point back to original tables", () => {
    const duplicated = duplicateDiagramSelection([postsTable], [edge]);
    const copiedPosts = duplicated.nodes[0];

    expect(duplicated.edges).toEqual([]);
    expect(copiedPosts.data.kind).toBe("psqlTable");

    if (copiedPosts.data.kind === "psqlTable") {
      expect(copiedPosts.data.foreignKeys).toEqual([]);
    }
  });

  it("remaps internal edges and foreign keys when both tables are copied", () => {
    const duplicated = duplicateDiagramSelection([postsTable, usersTable], [edge]);
    const copiedPosts = duplicated.nodes.find((node) => {
      return node.data.kind === "psqlTable" && node.data.tableName === "posts";
    });
    const copiedUsers = duplicated.nodes.find((node) => {
      return node.data.kind === "psqlTable" && node.data.tableName === "users";
    });

    expect(copiedPosts).toBeDefined();
    expect(copiedUsers).toBeDefined();
    expect(duplicated.edges).toHaveLength(1);
    expect(duplicated.edges[0]).toMatchObject({
      source: copiedPosts?.id,
      target: copiedUsers?.id,
    });

    if (copiedPosts?.data.kind === "psqlTable" && copiedUsers?.data.kind === "psqlTable") {
      expect(copiedPosts.data.foreignKeys[0]).toMatchObject({
        targetTableId: copiedUsers.id,
        targetColumnId: copiedUsers.data.columns[0].id,
      });
    }
  });
});
