import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  useReactFlow,
  useStore,
  useViewport,
  type Connection,
  type EdgeChange,
  type EdgeTypes,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { blockList } from "../domain/model";
import { RestResourceNode } from "./nodes/RestResourceNode";
import { PsqlTableNode } from "./nodes/PsqlTableNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import type { EdgeRouteObstacle } from "./edges/edgeRouting";
import type { BlockKind, DiagramEdge, DiagramNode } from "../domain/types";

type DiagramCanvasProps = {
  edges: DiagramEdge[];
  nodes: DiagramNode[];
  onAddNode: (kind: BlockKind, position?: { x: number; y: number }) => string;
  onConnect: (sourceId?: string | null, targetId?: string | null) => void;
  onEdgesChange: (changes: EdgeChange<DiagramEdge>[]) => void;
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onSelectNode: (nodeId: string | null) => void;
};

const nodeTypes = {
  restResource: RestResourceNode,
  psqlTable: PsqlTableNode,
} satisfies NodeTypes;

const edgeTypes = {
  default: AnimatedEdge,
  smoothstep: AnimatedEdge,
} satisfies EdgeTypes;

const fitViewOptions = {
  padding: 0.36,
  maxZoom: 0.82,
};

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.18;
const MINIMAP_WIDTH = 320;
const MINIMAP_HEIGHT = 190;
const MINIMAP_PADDING = 18;

type LayoutDiagramNode = DiagramNode & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 420;

const getNodeObstacle = (node: DiagramNode): EdgeRouteObstacle => {
  const layoutNode = node as LayoutDiagramNode;
  const width = layoutNode.measured?.width ?? layoutNode.width ?? DEFAULT_NODE_WIDTH;
  const height = layoutNode.measured?.height ?? layoutNode.height ?? DEFAULT_NODE_HEIGHT;

  return {
    id: node.id,
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
  };
};

const getObstacleCenter = (obstacle: EdgeRouteObstacle) => ({
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
  height: number;
  nodes: DiagramNode[];
  onCenter: (position: { x: number; y: number }) => void;
  viewport: { x: number; y: number; zoom: number };
  width: number;
};

const CanvasMinimap = ({
  edges,
  height,
  nodes,
  onCenter,
  viewport,
  width,
}: CanvasMinimapProps) => {
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
  const toMinimapRect = (obstacle: EdgeRouteObstacle) => {
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
    <button
      type="button"
      aria-label="Center canvas from minimap"
      className="canvas-minimap"
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = bounds.left + ((event.clientX - rect.left - offsetX) / scale);
        const y = bounds.top + ((event.clientY - rect.top - offsetY) / scale);

        onCenter({ x, y });
      }}
    >
      <svg viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`} aria-hidden="true">
        <g className="canvas-minimap__edges">
          {edges.map((edge) => {
            const sourceObstacle = obstacleById.get(edge.source);
            const targetObstacle = obstacleById.get(edge.target);

            if (!sourceObstacle || !targetObstacle) {
              return null;
            }

            const source = toMinimapPoint(getObstacleCenter(sourceObstacle));
            const target = toMinimapPoint(getObstacleCenter(targetObstacle));

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
    </button>
  );
};

export const DiagramCanvas = ({
  edges,
  nodes,
  onAddNode,
  onConnect,
  onEdgesChange,
  onNodesChange,
  onSelectEdge,
  onSelectNode,
}: DiagramCanvasProps) => {
  const { screenToFlowPosition, setCenter } = useReactFlow();
  const viewport = useViewport();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const [contextMenu, setContextMenu] = useState<{
    left: number;
    top: number;
    position: { x: number; y: number };
  } | null>(null);

  const renderedEdges = useMemo(() => {
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );
    const obstacles = nodes.map(getNodeObstacle);

    return edges.map((edge) => ({
      ...edge,
      type: "default" as const,
      data: {
        ...edge.data,
        sourceObstacle: obstacles.find((obstacle) => obstacle.id === edge.source),
        targetObstacle: obstacles.find((obstacle) => obstacle.id === edge.target),
        obstacles: obstacles.filter(
          (obstacle) => obstacle.id !== edge.source && obstacle.id !== edge.target,
        ),
        linked:
          selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target),
      },
    }));
  }, [edges, nodes]);

  return (
    <div className="canvas-shell">
      <ReactFlow
        fitView
        fitViewOptions={fitViewOptions}
        edges={renderedEdges}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        nodes={nodes}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        onConnect={(connection: Connection) =>
          onConnect(connection.source, connection.target)
        }
        onEdgesChange={onEdgesChange}
        onEdgeClick={(_, edge) => {
          setContextMenu(null);
          onSelectNode(null);
          onSelectEdge(edge.id);
        }}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => {
          setContextMenu(null);
          onSelectEdge(null);
          onSelectNode(node.id);
        }}
        onPaneClick={() => {
          setContextMenu(null);
          onSelectEdge(null);
          onSelectNode(null);
        }}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({
            left: event.clientX,
            top: event.clientY,
            position: screenToFlowPosition({
              x: event.clientX,
              y: event.clientY,
            }),
          });
        }}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>
      <CanvasMinimap
        edges={renderedEdges}
        height={height}
        nodes={nodes}
        viewport={viewport}
        width={width}
        onCenter={(position) =>
          setCenter(position.x, position.y, {
            zoom: Math.min(Math.max(viewport.zoom, MIN_ZOOM), MAX_ZOOM),
            duration: 180,
          })
        }
      />
      {contextMenu ? (
        <div
          className="canvas-context-menu"
          style={{ left: contextMenu.left, top: contextMenu.top }}
        >
          <span className="eyebrow">Add block</span>
          {blockList.map(({ kind, label }) => (
            <button
              key={kind}
              type="button"
              onClick={() => {
                onAddNode(kind, contextMenu.position);
                setContextMenu(null);
              }}
            >
              <span className={`floating-dock__dot floating-dock__dot--${kind}`} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
