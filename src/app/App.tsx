import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { BlockToolbar } from "../components/BlockToolbar";
import { DiagramCanvas } from "../components/DiagramCanvas";
import { DiagramSidebar } from "../components/DiagramSidebar";
import { ThemeToggle } from "../components/ThemeToggle";
import { deriveResourceSchemas } from "../domain/resourceSchema";
import type { DiagramNode } from "../domain/types";
import { DiagramProvider } from "./diagramContext";
import { useDiagramStore } from "./useDiagramStore";
import { useTheme } from "./useTheme";

export const App = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [copiedNode, setCopiedNode] = useState<DiagramNode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const copiedNodeRef = useRef<DiagramNode | null>(null);
  const selectedNodeRef = useRef<DiagramNode | undefined>(undefined);
  const { theme, toggleTheme } = useTheme();
  const {
    activeDiagram,
    addAppComponent,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addRestMethodInput,
    addSqlColumn,
    addSqlIndex,
    collection,
    connectNodes,
    createDiagram,
    canRedo,
    canUndo,
    deleteDiagram,
    deleteEdge,
    deleteNode,
    duplicateNode,
    onEdgesChange,
    onNodesChange,
    renameDiagram,
    replaceAppComponents,
    replaceResourceSchema,
    replaceRestMethodInputs,
    replaceSqlColumns,
    replaceSqlIndices,
    removeRestMethod,
    redo,
    selectDiagram,
    undo,
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

  const selectedNode = useMemo(
    () => canvasNodes.find((node) => node.id === selectedNodeId),
    [canvasNodes, selectedNodeId],
  );

  useEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);

  useEffect(() => {
    if (selectedNodeId && !selectedNode) {
      setSelectedNodeId(null);
    }
  }, [selectedNode, selectedNodeId]);

  useEffect(() => {
    copiedNodeRef.current = copiedNode;
  }, [copiedNode]);

  const addAndSelectNode = useCallback(
    (kind: Parameters<typeof addNode>[0], position?: { x: number; y: number }) => {
      const nodeId = addNode(kind, position);
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

      if (key === "z") {
        event.preventDefault();
        event.stopPropagation();

        const runHistoryAction = event.shiftKey ? redo : undo;
        const canRunHistoryAction = event.shiftKey ? canRedo : canUndo;

        if (canRunHistoryAction) {
          runHistoryAction();
        }

        return;
      }

      if (key === "c" && currentSelectedNode) {
        event.preventDefault();
        event.stopPropagation();
        setCopiedNode(currentSelectedNode);
      }

      if (key === "v" && currentCopiedNode) {
        event.preventDefault();
        event.stopPropagation();
        const nodeId = duplicateNode(currentCopiedNode);
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

    return () =>
      window.removeEventListener("keydown", handleKeyboard, { capture: true });
  }, [canRedo, canUndo, duplicateNode, redo, undo]);

  const contextValue = useMemo(
    () => ({
      nodes: canvasNodes,
      edges: activeDiagram.edges,
      resourceSchemas,
      onAddAppComponent: addAppComponent,
      onAddResourceSchemaField: addResourceSchemaField,
      onAddRestMethod: addRestMethod,
      onAddRestMethodInput: addRestMethodInput,
      onAddSqlColumn: addSqlColumn,
      onAddSqlIndex: addSqlIndex,
      onDeleteEdge: deleteEdge,
      onDeleteNode: (nodeId: string) => {
        deleteNode(nodeId);
        setSelectedNodeId((current) => (current === nodeId ? null : current));
      },
      onReplaceAppComponents: replaceAppComponents,
      onReplaceResourceSchema: replaceResourceSchema,
      onReplaceRestMethodInputs: replaceRestMethodInputs,
      onReplaceSqlColumns: replaceSqlColumns,
      onReplaceSqlIndices: replaceSqlIndices,
      onRemoveRestMethod: removeRestMethod,
      onUpdateEdgeData: updateEdgeData,
      onUpdateNodeData: updateNodeData,
      onUpdateRestMethod: updateRestMethod,
    }),
    [
      activeDiagram.edges,
      addAppComponent,
      addResourceSchemaField,
      addRestMethod,
      addRestMethodInput,
      addSqlColumn,
      addSqlIndex,
      canvasNodes,
      deleteEdge,
      deleteNode,
      removeRestMethod,
      replaceAppComponents,
      replaceResourceSchema,
      replaceRestMethodInputs,
      replaceSqlColumns,
      replaceSqlIndices,
      resourceSchemas,
      updateEdgeData,
      updateNodeData,
      updateRestMethod,
    ],
  );

  return (
    <ReactFlowProvider>
      <DiagramProvider value={contextValue}>
        <div className="app-shell">
          <main className="workspace">
            <DiagramCanvas
              edges={activeDiagram.edges}
              nodes={canvasNodes}
              onAddNode={addAndSelectNode}
              onConnect={connectNodes}
              onEdgesChange={onEdgesChange}
              onNodesChange={onNodesChange}
              onSelectEdge={() => {}}
              onSelectNode={setSelectedNodeId}
            />
          </main>

          <BlockToolbar onAddNode={addAndSelectNode} />

          <div className="app-topbar">
            <div className="app-topbar__left">
              <button
                aria-label="Open diagrams"
                className="icon-button"
                type="button"
                onClick={() => setDrawerOpen(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
              <div className="diagram-title">
                <span className="eyebrow">Diagram</span>
                <h2>{activeDiagram.name}</h2>
              </div>
            </div>
            <div className="app-topbar__right">
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
          </div>

          <DiagramSidebar
            activeDiagramId={collection.activeDiagramId}
            diagrams={collection.diagrams}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            onCreateDiagram={() => {
              createDiagram();
              setSelectedNodeId(null);
            }}
            onDeleteDiagram={(diagramId) => {
              deleteDiagram(diagramId);
              setSelectedNodeId(null);
            }}
            onRenameDiagram={renameDiagram}
            onSelectDiagram={(diagramId) => {
              selectDiagram(diagramId);
              setSelectedNodeId(null);
            }}
          />
        </div>
      </DiagramProvider>
    </ReactFlowProvider>
  );
};
