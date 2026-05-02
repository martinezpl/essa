import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type NodeTypes,
} from "@xyflow/react";
import { blockList } from "../domain/model";
import { AppViewNode } from "./nodes/AppViewNode";
import { RestResourceNode } from "./nodes/RestResourceNode";
import { SqlTableNode } from "./nodes/SqlTableNode";
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
  appView: AppViewNode,
  restResource: RestResourceNode,
  sqlTable: SqlTableNode,
} satisfies NodeTypes;

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

  const visibleEdges = useMemo(
    () =>
      edges.map((edge) => ({
        ...edge,
        animated: true,
        label: `${edge.data.kind}: ${edge.data.dataPath || "all"}`,
      })),
    [edges],
  );

  return (
    <div className="canvas-shell">
      <ReactFlow
        fitView
        edges={visibleEdges}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onConnect={(connection: Connection) => onConnect(connection.source, connection.target)}
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
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
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
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
