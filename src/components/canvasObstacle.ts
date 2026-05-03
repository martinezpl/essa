import type { DiagramNode } from "../domain/types";

const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 420;

export type CanvasNodeBounds = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type LayoutDiagramNode = DiagramNode & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

export const getNodeObstacle = (node: DiagramNode): CanvasNodeBounds => {
  const layoutNode = node as LayoutDiagramNode;
  const width =
    layoutNode.measured?.width ??
    layoutNode.width ??
    (node.data.kind === "annotation" ? node.data.width : DEFAULT_NODE_WIDTH);
  const height =
    layoutNode.measured?.height ??
    layoutNode.height ??
    (node.data.kind === "annotation" ? node.data.height : DEFAULT_NODE_HEIGHT);

  return {
    id: node.id,
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
  };
};
