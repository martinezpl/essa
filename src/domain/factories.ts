import type {
  AppViewData,
  BlockKind,
  Diagram,
  DiagramNode,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
  SqlTableData,
} from "./types";
import {
  createBlock,
  createRestResourceMethodContract,
  hydrateBlock,
} from "./model";
import { createId } from "./id";
export { createId } from "./id";

const nowIso = () => new Date().toISOString();

export const createRestResourceMethod = (
  kind: RestMethodKind,
): RestResourceMethod => createRestResourceMethodContract(kind);

export const blankBlockData = (kind: BlockKind): AppViewData | RestResourceData | SqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 });

  return block.data;
};

export const seededBlockData = (kind: BlockKind): AppViewData | RestResourceData | SqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 }, { seed: true });

  return block.data;
};

export const createDiagramNode = (
  kind: BlockKind,
  position: { x: number; y: number },
  options: { seed?: boolean } = {},
): DiagramNode => createBlock(kind, position, options).serialize();

export const cloneDiagramNode = (node: DiagramNode): DiagramNode => {
  return hydrateBlock(node).clone().serialize();
};

export const createStarterDiagram = (): Diagram => {
  const createdAt = nowIso();
  const appNode = createDiagramNode("appView", { x: 80, y: 120 }, { seed: true });
  const restNode = createDiagramNode("restResource", { x: 420, y: 120 }, { seed: true });
  const sqlNode = createDiagramNode("sqlTable", { x: 760, y: 120 }, { seed: true });

  if (appNode.data.kind === "appView") {
    appNode.data.components = appNode.data.components.map((component) => ({
      ...component,
      dataUsage: {
        resourceId: restNode.id,
        operation: "read",
        dataPath: "all",
      },
    }));
  }

  return {
    id: createId("diagram"),
    name: "Starter Diagram",
    createdAt,
    updatedAt: createdAt,
    nodes: [appNode, restNode, sqlNode],
    edges: [
      {
        id: createId("edge"),
        source: restNode.id,
        target: sqlNode.id,
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
