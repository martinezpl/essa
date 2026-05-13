import type {
  BlockKind,
  CanvasNodeKind,
  Diagram,
  DiagramNode,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
  AppViewData,
  PsqlTableData,
} from "./types";
import {
  createBlock,
  createCanvasNode,
  createRestResourceMethodContract,
  hydrateCanvasNode,
} from "./model";
import {
  appViewOnLoadSourceHandleId,
  restMethodTargetHandleId,
} from "./connectionEndpoints";
import { createId } from "./id";
export { createId } from "./id";

const nowIso = () => new Date().toISOString();

export const createRestResourceMethod = (
  kind: RestMethodKind,
): RestResourceMethod => createRestResourceMethodContract(kind);

export const blankBlockData = (
  kind: BlockKind,
): AppViewData | RestResourceData | PsqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 });

  return block.data;
};

export const seededBlockData = (
  kind: BlockKind,
): AppViewData | RestResourceData | PsqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 }, { seed: true });

  return block.data;
};

export const createDiagramNode = (
  kind: CanvasNodeKind,
  position: { x: number; y: number },
  options: { seed?: boolean } = {},
): DiagramNode => createCanvasNode(kind, position, options).serialize();

export const cloneDiagramNode = (node: DiagramNode): DiagramNode => {
  return hydrateCanvasNode(node).clone().serialize();
};

export const createStarterDiagram = (): Diagram => {
  const createdAt = nowIso();
  const statusEnumId = createId("psql-enum");
  const feedViewId = createId("node");
  const postsResourceId = createId("node");
  const usersResourceId = createId("node");
  const postsTableId = createId("node");
  const usersTableId = createId("node");
  const postsListMethodId = createId("method");
  const postIdColumnId = createId("column");
  const postTitleColumnId = createId("column");
  const postStatusColumnId = createId("column");
  const postAuthorColumnId = createId("column");
  const postCreatedAtColumnId = createId("column");
  const userIdColumnId = createId("column");
  const userEmailColumnId = createId("column");

  return {
    id: createId("diagram"),
    name: "Starter Diagram",
    createdAt,
    updatedAt: createdAt,
    psqlEnums: [
      {
        id: statusEnumId,
        name: "post_status",
        values: ["draft", "published", "archived"],
      },
    ],
    nodes: [
      {
        id: feedViewId,
        type: "appView",
        position: { x: -1149.1362725975898, y: -428.6522552849637 },
        data: {
          kind: "appView",
          viewName: "Feed",
          route: "/feed",
          description:
            "Main reader-facing entry point that loads the latest published posts.",
          events: [
            {
              id: createId("event"),
              name: "RefreshButton::onClick",
            },
          ],
        },
      },
      {
        id: postsResourceId,
        type: "restResource",
        position: { x: -74.56451606595385, y: -475.0711173803418 },
        data: {
          kind: "restResource",
          resourceName: "posts",
          description:
            "Public article collection. Readers browse published posts while editors create drafts and publish updates.",
          methods: [
            {
              ...createRestResourceMethodContract("GET /"),
              id: postsListMethodId,
              input: [
                {
                  id: createId("input"),
                  name: "status",
                  type: "string",
                  mode: "query",
                  description: "Filter the collection by publication status.",
                },
              ],
            },
            createRestResourceMethodContract("GET /{id}"),
            {
              ...createRestResourceMethodContract("POST /"),
              input: [
                {
                  id: createId("input"),
                  name: "title",
                  type: "string",
                  mode: "payload",
                  description: "Headline shown in post listings.",
                },
                {
                  id: createId("input"),
                  name: "author_id",
                  type: "string",
                  mode: "payload",
                  description: "User that owns the post.",
                },
              ],
            },
          ],
          schema: [
            {
              id: createId("schema-field"),
              name: "id",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: postsTableId,
              sourceColumnId: postIdColumnId,
              exclude: [],
              description: "Stable post identifier.",
            },
            {
              id: createId("schema-field"),
              name: "title",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: postsTableId,
              sourceColumnId: postTitleColumnId,
              exclude: [],
              description: "Reader-facing headline.",
            },
            {
              id: createId("schema-field"),
              name: "status",
              type: "string",
              isArray: false,
              enum: ["draft", "published", "archived"],
              nullable: false,
              sourceTableId: postsTableId,
              sourceColumnId: postStatusColumnId,
              exclude: [],
              description: "Draft, published, or archived lifecycle state.",
            },
            {
              id: createId("schema-field"),
              name: "author_id",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: postsTableId,
              sourceColumnId: postAuthorColumnId,
              exclude: [],
              description: "Foreign key pointing at the author user.",
            },
            {
              id: createId("schema-field"),
              name: "created_at",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: postsTableId,
              sourceColumnId: postCreatedAtColumnId,
              exclude: [],
              description: "Timestamp used for sorting feeds.",
            },
          ],
        },
      },
      {
        id: usersResourceId,
        type: "restResource",
        position: { x: -93.83123605065526, y: 1346.4802894392803 },
        data: {
          kind: "restResource",
          resourceName: "users",
          description:
            "Author accounts that own posts. This resource shows a read-only API backed by a separate table.",
          methods: [
            {
              ...createRestResourceMethodContract("GET /"),
              input: [
                {
                  id: createId("input"),
                  name: "email",
                  type: "string",
                  mode: "query",
                  description: "Find users by email address.",
                },
              ],
            },
            createRestResourceMethodContract("GET /{id}"),
          ],
          schema: [
            {
              id: createId("schema-field"),
              name: "id",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: usersTableId,
              sourceColumnId: userIdColumnId,
              exclude: [],
              description: "Stable user identifier.",
            },
            {
              id: createId("schema-field"),
              name: "email",
              type: "string",
              isArray: false,
              nullable: false,
              sourceTableId: usersTableId,
              sourceColumnId: userEmailColumnId,
              exclude: [],
              description: "Unique login and contact address.",
            },
          ],
        },
      },
      {
        id: postsTableId,
        type: "psqlTable",
        position: { x: 2211.6582788515184, y: -491.45540875519043 },
        data: {
          kind: "psqlTable",
          tableName: "post",
          primaryKey: [postIdColumnId],
          columns: [
            {
              id: postIdColumnId,
              name: "id",
              type: "uuid",
              nullable: false,
              unique: false,
            },
            {
              id: postTitleColumnId,
              name: "title",
              type: "text",
              nullable: false,
              unique: false,
            },
            {
              id: postStatusColumnId,
              name: "status",
              type: "enum",
              options: { enumId: statusEnumId },
              nullable: false,
              unique: false,
            },
            {
              id: postAuthorColumnId,
              name: "author_id",
              type: "uuid",
              nullable: false,
              unique: false,
            },
            {
              id: postCreatedAtColumnId,
              name: "created_at",
              type: "timestamptz",
              nullable: false,
              unique: false,
            },
          ],
          foreignKeys: [
            {
              id: createId("foreign-key"),
              name: "author_id",
              type: "uuid",
              nullable: false,
              targetTableId: usersTableId,
              targetColumnId: userIdColumnId,
              onDelete: "NO ACTION",
              onUpdate: "NO ACTION",
            },
          ],
          indices: [
            {
              id: createId("index"),
              columns: [postStatusColumnId],
              method: "btree",
              unique: false,
            },
          ],
        },
      },
      {
        id: usersTableId,
        type: "psqlTable",
        position: { x: 1057.2582437240349, y: 1294.1707337742985 },
        data: {
          kind: "psqlTable",
          tableName: "user",
          primaryKey: [userIdColumnId],
          columns: [
            {
              id: userIdColumnId,
              name: "id",
              type: "uuid",
              nullable: false,
              unique: false,
            },
            {
              id: userEmailColumnId,
              name: "email",
              type: "text",
              nullable: false,
              unique: false,
            },
          ],
          foreignKeys: [],
          indices: [
            {
              id: createId("index"),
              columns: [userEmailColumnId],
              method: "btree",
              unique: true,
            },
          ],
        },
      },
    ],
    edges: [
      {
        id: createId("edge"),
        source: feedViewId,
        sourceHandle: appViewOnLoadSourceHandleId(),
        target: postsResourceId,
        targetHandle: restMethodTargetHandleId(postsListMethodId),
        type: "smoothstep",
        data: { kind: "read", dataPath: "all" },
      },
      {
        id: createId("edge"),
        source: postsResourceId,
        target: postsTableId,
        type: "smoothstep",
        data: { kind: "read/write", dataPath: "all" },
      },
      {
        id: createId("edge"),
        source: usersResourceId,
        target: usersTableId,
        type: "smoothstep",
        data: { kind: "read", dataPath: "all" },
      },
    ],
  };
};

export const touchDiagram = (diagram: Diagram): Diagram => ({
  ...diagram,
  updatedAt: nowIso(),
});
