import { useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
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
  const { screenToFlowPosition } = useReactFlow();
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
        <MiniMap pannable zoomable position="top-right" />
      </ReactFlow>
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
