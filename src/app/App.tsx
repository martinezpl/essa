import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BlockToolbar } from "../components/BlockToolbar";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { DiagramSidebar } from "../components/DiagramSidebar";
import { Inspector } from "../components/Inspector";
import { deriveResourceSchemas } from "../domain/resourceSchema";
import type { DiagramNode } from "../domain/types";
import { useDiagramStore } from "./useDiagramStore";

export const App = () => {
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [copiedNode, setCopiedNode] = useState<DiagramNode | null>(null);
  const copiedNodeRef = useRef<DiagramNode | null>(null);
  const selectedNodeRef = useRef<DiagramNode | undefined>(undefined);
  const {
    activeDiagram,
    addAppComponent,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addSqlColumn,
    collection,
    connectNodes,
    createDiagram,
    deleteDiagram,
    deleteEdge,
    deleteNode,
    duplicateNode,
    onEdgesChange,
    onNodesChange,
    renameDiagram,
    replaceAppComponents,
    replaceResourceSchema,
    replaceSqlColumns,
    removeRestMethod,
    selectDiagram,
    updateEdgeData,
    updateNodeData,
    updateRestMethod,
  } = useDiagramStore();

  const resourceSchemas = useMemo(
    () => deriveResourceSchemas(activeDiagram),
    [activeDiagram],
  );

  const canvasNodes = useMemo(
    () =>
      activeDiagram.nodes.map((node) =>
        node.data.kind === "restResource"
          ? {
              ...node,
              data: {
                ...node.data,
                schema:
                  node.data.schema.length > 0
                    ? node.data.schema
                    : (resourceSchemas.get(node.id) ?? []),
              },
            }
          : node,
      ),
    [activeDiagram.nodes, resourceSchemas],
  );

  const selectedEdge = useMemo(
    () => activeDiagram.edges.find((edge) => edge.id === selectedEdgeId),
    [activeDiagram.edges, selectedEdgeId],
  );

  const selectedNode = useMemo(
    () => canvasNodes.find((node) => node.id === selectedNodeId),
    [canvasNodes, selectedNodeId],
  );

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    copiedNodeRef.current = copiedNode;
  }, [copiedNode]);

  const addAndSelectNode = useCallback(
    (kind: Parameters<typeof addNode>[0], position?: { x: number; y: number }) => {
      const nodeId = addNode(kind, position);
      setSelectedEdgeId(null);
      setSelectedNodeId(nodeId);

      return nodeId;
    },
    [addNode],
  );

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }

      return Boolean(
        target.closest("input, textarea, select") || target.isContentEditable,
      );
    };

    const handleKeyboard = (event: KeyboardEvent) => {
      const isModifierPressed = event.ctrlKey || event.metaKey;

      if (!isModifierPressed || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      const currentSelectedNode = selectedNodeRef.current;
      const currentCopiedNode = copiedNodeRef.current;

      if (key === "c" && currentSelectedNode) {
        event.preventDefault();
        event.stopPropagation();
        setCopiedNode(currentSelectedNode);
      }

      if (key === "v" && currentCopiedNode) {
        event.preventDefault();
        event.stopPropagation();
        const nodeId = duplicateNode(currentCopiedNode);
        setSelectedEdgeId(null);
        setSelectedNodeId(nodeId);
        const nextCopiedNode = {
          ...currentCopiedNode,
          id: nodeId,
          position: {
            x: currentCopiedNode.position.x + 48,
            y: currentCopiedNode.position.y + 48,
          },
        };
        copiedNodeRef.current = nextCopiedNode;
        setCopiedNode(nextCopiedNode);
      }
    };

    window.addEventListener("keydown", handleKeyboard, { capture: true });

    return () => window.removeEventListener("keydown", handleKeyboard, { capture: true });
  }, [duplicateNode]);

  return (
    <ReactFlowProvider>
      <div className="app-shell">
        <DiagramSidebar
          activeDiagramId={collection.activeDiagramId}
          diagrams={collection.diagrams}
          onCreateDiagram={() => {
            createDiagram();
            setSelectedEdgeId(null);
            setSelectedNodeId(null);
          }}
          onDeleteDiagram={(diagramId) => {
            deleteDiagram(diagramId);
            setSelectedEdgeId(null);
            setSelectedNodeId(null);
          }}
          onRenameDiagram={renameDiagram}
          onSelectDiagram={(diagramId) => {
            selectDiagram(diagramId);
            setSelectedEdgeId(null);
            setSelectedNodeId(null);
          }}
        />

        <main className="workspace">
          <header className="workspace__header">
            <div>
              <span className="eyebrow">Current diagram</span>
              <h2>{activeDiagram.name}</h2>
            </div>
            <BlockToolbar onAddNode={addAndSelectNode} />
          </header>

          <DiagramCanvas
            edges={activeDiagram.edges}
            nodes={canvasNodes}
            onAddNode={addAndSelectNode}
            onConnect={connectNodes}
            onEdgesChange={onEdgesChange}
            onNodesChange={onNodesChange}
            onSelectEdge={setSelectedEdgeId}
            onSelectNode={setSelectedNodeId}
          />
        </main>

        <Inspector
          edge={selectedEdge}
          edges={activeDiagram.edges}
          node={selectedNode}
          nodes={canvasNodes}
          resourceSchemas={resourceSchemas}
          onAddAppComponent={addAppComponent}
          onAddResourceSchemaField={addResourceSchemaField}
          onAddRestMethod={addRestMethod}
          onAddSqlColumn={addSqlColumn}
          onDeleteEdge={(edgeId) => {
            deleteEdge(edgeId);
            setSelectedEdgeId(null);
          }}
          onDeleteNode={(nodeId) => {
            deleteNode(nodeId);
            setSelectedNodeId(null);
          }}
          onReplaceAppComponents={replaceAppComponents}
          onReplaceResourceSchema={replaceResourceSchema}
          onReplaceSqlColumns={replaceSqlColumns}
          onRemoveRestMethod={removeRestMethod}
          onUpdateEdgeData={updateEdgeData}
          onUpdateNodeData={updateNodeData}
          onUpdateRestMethod={updateRestMethod}
        />
      </div>
    </ReactFlowProvider>
  );
};
