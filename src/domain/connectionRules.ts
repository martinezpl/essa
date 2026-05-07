import type {
  ConnectionKind,
  DiagramEdge,
  DiagramNode,
} from "./types";
import type { DiagramModel } from "./model";
import {
  Connection,
  getCompatibleConnectionKind,
  hydrateBlock,
} from "./model";

export const getConnectionKind = (
  source?: DiagramNode,
  target?: DiagramNode,
): ConnectionKind | null => {
  if (!source || !target || source.id === target.id) {
    return null;
  }

  if (source.data.kind === "annotation" || target.data.kind === "annotation") {
    return null;
  }

  return getCompatibleConnectionKind(hydrateBlock(source), hydrateBlock(target));
};

export const hasDuplicateConnection = (
  edges: DiagramEdge[],
  sourceId: string,
  targetId: string,
) => edges.some((edge) => edge.source === sourceId && edge.target === targetId);

export const createValidatedEdge = (
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  sourceId?: string | null,
  targetId?: string | null,
): DiagramEdge | null => {
  if (
    !sourceId ||
    !targetId ||
    hasDuplicateConnection(edges, sourceId, targetId)
  ) {
    return null;
  }

  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);

  if (
    !source ||
    !target ||
    source.data.kind === "annotation" ||
    target.data.kind === "annotation"
  ) {
    return null;
  }

  return Connection.create(hydrateBlock(source), hydrateBlock(target))?.serialize() ?? null;
};

export const createValidatedConnection = (
  diagram: Pick<DiagramModel, "createConnection">,
  sourceId?: string | null,
  targetId?: string | null,
): DiagramEdge | null =>
  diagram.createConnection(sourceId, targetId)?.serialize() ?? null;
