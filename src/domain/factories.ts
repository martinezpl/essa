import type {
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

export const blankBlockData = (kind: BlockKind): RestResourceData | PsqlTableData => {
  const block = createBlock(kind, { x: 0, y: 0 });

  return block.data;
};

export const seededBlockData = (kind: BlockKind): RestResourceData | PsqlTableData => {
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
  const restNode = createDiagramNode("restResource", { x: 240, y: 120 }, { seed: true });
  const psqlNode = createDiagramNode("psqlTable", { x: 600, y: 120 }, { seed: true });

  return {
    id: createId("diagram"),
    name: "Starter Diagram",
    createdAt,
    updatedAt: createdAt,
    psqlEnums: [],
    nodes: [restNode, psqlNode],
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
