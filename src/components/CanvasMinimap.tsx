import { useMemo } from "react";
import { useReactFlow, useStore, useViewport } from "@xyflow/react";
import { getNodeObstacle, type CanvasNodeBounds } from "./canvasObstacle";
import type { DiagramEdge, DiagramNode } from "../domain/types";

const MINIMAP_WIDTH = 320;
const MINIMAP_HEIGHT = 190;
const MINIMAP_PADDING = 18;
const MIN_CENTER_ZOOM = 0.1;
const MAX_CENTER_ZOOM = 1.18;

const getObstacleCenter = (obstacle: CanvasNodeBounds) => ({
  x: (obstacle.left + obstacle.right) / 2,
  y: (obstacle.top + obstacle.bottom) / 2,
});

const getEdgeClass = (edge: DiagramEdge) => {
  const edgeData = edge.data as Record<string, unknown>;

  if (edgeData.readonly === true && edge.data.dataPath === "FK") {
    return "fk";
  }

  return edge.data.kind.replace("/", "-");
};

type CanvasMinimapProps = {
  edges: DiagramEdge[];
  nodes: DiagramNode[];
  className?: string;
};

export const CanvasMinimap = ({ edges, nodes, className }: CanvasMinimapProps) => {
  const viewport = useViewport();
  const { setCenter } = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);

  const obstacles = useMemo(() => nodes.map(getNodeObstacle), [nodes]);
  const obstacleById = useMemo(
    () => new Map(obstacles.map((obstacle) => [obstacle.id, obstacle])),
    [obstacles],
  );
  const viewportBounds = {
    left: -viewport.x / viewport.zoom,
    top: -viewport.y / viewport.zoom,
    right: (-viewport.x + width) / viewport.zoom,
    bottom: (-viewport.y + height) / viewport.zoom,
  };
  const bounds = obstacles.reduce(
    (current, obstacle) => ({
      left: Math.min(current.left, obstacle.left),
      top: Math.min(current.top, obstacle.top),
      right: Math.max(current.right, obstacle.right),
      bottom: Math.max(current.bottom, obstacle.bottom),
    }),
    viewportBounds,
  );
  const boundsWidth = Math.max(1, bounds.right - bounds.left);
  const boundsHeight = Math.max(1, bounds.bottom - bounds.top);
  const scale = Math.min(
    (MINIMAP_WIDTH - MINIMAP_PADDING * 2) / boundsWidth,
    (MINIMAP_HEIGHT - MINIMAP_PADDING * 2) / boundsHeight,
  );
  const contentWidth = boundsWidth * scale;
  const contentHeight = boundsHeight * scale;
  const offsetX = (MINIMAP_WIDTH - contentWidth) / 2;
  const offsetY = (MINIMAP_HEIGHT - contentHeight) / 2;
  const toMinimapPoint = (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - bounds.left) * scale,
    y: offsetY + (point.y - bounds.top) * scale,
  });
  const toMinimapRect = (obstacle: CanvasNodeBounds) => {
    const point = toMinimapPoint({ x: obstacle.left, y: obstacle.top });

    return {
      ...point,
      width: Math.max(3, (obstacle.right - obstacle.left) * scale),
      height: Math.max(3, (obstacle.bottom - obstacle.top) * scale),
    };
  };
  const viewportRect = toMinimapRect({
    id: "viewport",
    ...viewportBounds,
  });

  return (
    <div
      role="presentation"
      aria-label="Center canvas from minimap"
      className={className ? `canvas-minimap ${className}` : "canvas-minimap"}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const ratioX = rect.width === 0 ? 0 : (event.clientX - rect.left) / rect.width;
        const ratioY = rect.height === 0 ? 0 : (event.clientY - rect.top) / rect.height;
        const x =
          bounds.left + (ratioX * MINIMAP_WIDTH - offsetX) / scale;
        const y =
          bounds.top + (ratioY * MINIMAP_HEIGHT - offsetY) / scale;

        setCenter(x, y, {
          zoom: Math.min(Math.max(viewport.zoom, MIN_CENTER_ZOOM), MAX_CENTER_ZOOM),
          duration: 180,
        });
      }}
    >
      <svg viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`} aria-hidden="true">
        <g className="canvas-minimap__edges">
          {edges.map((edge) => {
            const sourceBounds = obstacleById.get(edge.source);
            const targetBounds = obstacleById.get(edge.target);

            if (!sourceBounds || !targetBounds) {
              return null;
            }

            const source = toMinimapPoint(getObstacleCenter(sourceBounds));
            const target = toMinimapPoint(getObstacleCenter(targetBounds));

            return (
              <line
                key={edge.id}
                className={`canvas-minimap__edge canvas-minimap__edge--${getEdgeClass(edge)}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
              />
            );
          })}
        </g>
        <g className="canvas-minimap__nodes">
          {nodes.map((node) => {
            const obstacle = obstacleById.get(node.id);

            if (!obstacle) {
              return null;
            }

            const rect = toMinimapRect(obstacle);

            return (
              <rect
                key={node.id}
                className={`canvas-minimap__node canvas-minimap__node--${node.data.kind}${
                  node.selected ? " canvas-minimap__node--selected" : ""
                }`}
                x={rect.x}
                y={rect.y}
                width={rect.width}
                height={rect.height}
                rx="3"
              />
            );
          })}
        </g>
        <rect
          className="canvas-minimap__viewport"
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          rx="5"
        />
      </svg>
    </div>
  );
};
