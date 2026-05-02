import type {
  AppViewData,
  BlockKind,
  Diagram,
  DiagramNode,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
  PsqlTableData,
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

export const blankBlockData = (kind: BlockKind): AppViewData | RestResourceData | PsqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 });

  return block.data;
};

export const seededBlockData = (kind: BlockKind): AppViewData | RestResourceData | PsqlTableData => {
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
  const psqlNode = createDiagramNode("psqlTable", { x: 760, y: 120 }, { seed: true });

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
    nodes: [appNode, restNode, psqlNode],
    edges: [
      {
        id: createId("edge"),
        source: restNode.id,
        target: psqlNode.id,
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
