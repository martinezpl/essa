import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { DiagramCanvas, type CanvasMode } from "../components/DiagramCanvas";
import {
  DiagramSidebar,
  type DiagramExportFormat,
} from "../components/DiagramSidebar";
import { HelpModal } from "../components/HelpModal";
import { ThemeToggle } from "../components/ThemeToggle";
import {
  parseEssaDiagram,
  serializeEssaDiagram,
  serializeMarkdownDiagram,
} from "../domain/diagramExport";
import { deriveResourceSchemas } from "../domain/resourceSchema";
import {
  psqlColumnTargetHandleId,
  psqlForeignKeySourceHandleId,
} from "../domain/psqlForeignKeys";
import type { Diagram, DiagramEdge, DiagramNode } from "../domain/types";
import { DiagramProvider } from "./diagramContext";
import { useDiagramStore } from "./useDiagramStore";
import { useTheme } from "./useTheme";

type PsqlTableDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

const slugifyFileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "diagram";

const downloadTextFile = (filename: string, contents: string, type: string) => {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const HELP_COOKIE_NAME = "essa.help.seen";
const HELP_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const hasHelpCookie = () =>
  document.cookie
    .split(";")
    .some((cookie) => cookie.trim().startsWith(`${HELP_COOKIE_NAME}=`));

const setHelpCookie = () => {
  document.cookie = `${HELP_COOKIE_NAME}=1; Max-Age=${HELP_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`;
};

export const App = () => {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("grip");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => !hasHelpCookie());
  const [copiedNodes, setCopiedNodes] = useState<DiagramNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const copiedNodesRef = useRef<DiagramNode[]>([]);
  const selectedNodesRef = useRef<DiagramNode[]>([]);
  const { theme, toggleTheme } = useTheme();
  const {
    activeDiagram,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addRestMethodInput,
    addPsqlColumn,
    addPsqlEnum,
    addPsqlForeignKey,
    addPsqlIndex,
    collection,
    connectNodes,
    createDiagram,
    canRedo,
    canUndo,
    deleteDiagram,
    deleteEdge,
    deleteNode,
    duplicateNode,
    duplicateNodes,
    importDiagram,
    onEdgesChange,
    onNodesChange,
    renameDiagram,
    replaceResourceSchema,
    replaceRestMethodInputs,
    replacePsqlColumns,
    replacePsqlEnums,
    replacePsqlForeignKeys,
    replacePsqlIndices,
    removeRestMethod,
    redo,
    selectDiagram,
    undo,
    updateEdgeData,
    updateNodeData,
    updatePsqlColumnOptions,
    updateRestMethod,
  } = useDiagramStore();

  const resourceSchemas = useMemo(
    () => deriveResourceSchemas(activeDiagram),
    [activeDiagram],
  );

  const canvasNodes = useMemo(
    () =>
      activeDiagram.nodes.map((node) => {
        if (node.data.kind === "restResource") {
          return {
              ...node,
              data: {
                ...node.data,
                schema:
                  node.data.schema.length > 0
                    ? node.data.schema
                    : (resourceSchemas.get(node.id) ?? []),
              },
            };
        }

        if (node.data.kind === "annotation") {
          return {
            ...node,
            draggable: false,
            selectable: false,
            zIndex: -1,
          };
        }

        return node;
      }),
    [activeDiagram.nodes, resourceSchemas],
  );

  const canvasEdges = useMemo<DiagramEdge[]>(() => {
    const psqlTables = activeDiagram.nodes.filter(
      (node): node is PsqlTableDiagramNode => node.data.kind === "psqlTable",
    );
    const psqlTableById = new Map(psqlTables.map((node) => [node.id, node]));

    const foreignKeyEdges = activeDiagram.nodes.flatMap((node) => {
      if (node.data.kind !== "psqlTable") {
        return [];
      }

      return node.data.foreignKeys.flatMap((foreignKey): DiagramEdge[] => {
        if (!foreignKey.targetTableId || !foreignKey.targetColumnId) {
          return [];
        }

        const targetTable = psqlTableById.get(foreignKey.targetTableId);
        const targetColumn = targetTable?.data.columns.find(
          (column) =>
            column.id === foreignKey.targetColumnId && column.primaryKey,
        );

        if (!targetTable || !targetColumn) {
          return [];
        }

        return [
          {
            id: `fk-edge-${node.id}-${foreignKey.id}`,
            source: node.id,
            sourceHandle: psqlForeignKeySourceHandleId(foreignKey.id),
            target: foreignKey.targetTableId,
            targetHandle: psqlColumnTargetHandleId(foreignKey.targetColumnId),
            type: "smoothstep",
            data: { kind: "read", dataPath: "FK", readonly: true } as DiagramEdge["data"],
          },
        ];
      });
    });

    return [...activeDiagram.edges, ...foreignKeyEdges];
  }, [activeDiagram.edges, activeDiagram.nodes]);

  const selectedNodes = useMemo(
    () => {
      const selected = activeDiagram.nodes.filter((node) => node.selected);
      const fallback = selectedNodeId
        ? activeDiagram.nodes.find((node) => node.id === selectedNodeId)
        : null;

      return selected.length > 0 ? selected : fallback ? [fallback] : [];
    },
    [activeDiagram.nodes, selectedNodeId],
  );

  useEffect(() => {
    selectedNodesRef.current = selectedNodes;
  }, [selectedNodes]);

  useEffect(() => {
    if (
      selectedNodeId &&
      !activeDiagram.nodes.some((node) => node.id === selectedNodeId)
    ) {
      setSelectedNodeId(null);
    }
  }, [activeDiagram.nodes, selectedNodeId]);

  useEffect(() => {
    copiedNodesRef.current = copiedNodes;
  }, [copiedNodes]);

  const addAndSelectNode = useCallback(
    (
      kind: Parameters<typeof addNode>[0],
      position?: { x: number; y: number },
      dataPatch?: Parameters<typeof addNode>[2],
    ) => {
      const nodeId = addNode(kind, position, dataPatch);
      setSelectedNodeId(kind === "annotation" ? null : nodeId);

      return nodeId;
    },
    [addNode],
  );

  const handleExportDiagram = useCallback(
    (diagram: Diagram, format: DiagramExportFormat) => {
      const filename = slugifyFileName(diagram.name);

      if (format === "essa") {
        downloadTextFile(
          `${filename}.essa`,
          serializeEssaDiagram(diagram),
          "application/json",
        );
        return;
      }

      downloadTextFile(
        `${filename}.md`,
        serializeMarkdownDiagram(diagram),
        "text/markdown",
      );
    },
    [],
  );

  const handleImportEssa = useCallback(
    async (file: File) => {
      try {
        const rawValue = await file.text();
        const diagram = parseEssaDiagram(rawValue);
        importDiagram(diagram);
        setSelectedNodeId(null);
      } catch {
        window.alert("Could not import this .essa file.");
      }
    },
    [importDiagram],
  );

  const closeHelp = useCallback(() => {
    setHelpCookie();
    setHelpOpen(false);
  }, []);

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
      const key = event.key.toLowerCase();

      if (!isModifierPressed && !event.altKey && !isEditableTarget(event.target)) {
        const modeByKey: Partial<Record<string, CanvasMode>> = {
          q: "grip",
          w: "select",
          e: "annotate",
        };
        const nextMode = modeByKey[key];

        if (nextMode) {
          event.preventDefault();
          event.stopPropagation();
          setCanvasMode(nextMode);
          return;
        }
      }

      if (!isModifierPressed || event.altKey || isEditableTarget(event.target)) {
        return;
      }

      const currentSelectedNodes = selectedNodesRef.current;
      const currentCopiedNodes = copiedNodesRef.current;

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

      if (key === "c" && currentSelectedNodes.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        setCopiedNodes(currentSelectedNodes);
      }

      if (key === "v" && currentCopiedNodes.length > 0) {
        event.preventDefault();
        event.stopPropagation();
        const nextCopiedNodes = currentCopiedNodes.length === 1
          ? [duplicateNode(currentCopiedNodes[0])]
              .map((nodeId) => ({
                ...currentCopiedNodes[0],
                id: nodeId,
                position: {
                  x: currentCopiedNodes[0].position.x + 48,
                  y: currentCopiedNodes[0].position.y + 48,
                },
              }))
          : duplicateNodes(currentCopiedNodes);

        if (nextCopiedNodes[0]) {
          setSelectedNodeId(nextCopiedNodes[0].id);
        }

        copiedNodesRef.current = nextCopiedNodes;
        setCopiedNodes(nextCopiedNodes);
      }
    };

    window.addEventListener("keydown", handleKeyboard, { capture: true });

    return () =>
      window.removeEventListener("keydown", handleKeyboard, { capture: true });
  }, [canRedo, canUndo, duplicateNode, duplicateNodes, redo, undo]);

  const contextValue = useMemo(
    () => ({
      nodes: canvasNodes,
      edges: canvasEdges,
      psqlEnums: activeDiagram.psqlEnums,
      resourceSchemas,
      onAddResourceSchemaField: addResourceSchemaField,
      onAddRestMethod: addRestMethod,
      onAddRestMethodInput: addRestMethodInput,
      onAddPsqlColumn: addPsqlColumn,
      onAddPsqlEnum: addPsqlEnum,
      onAddPsqlForeignKey: addPsqlForeignKey,
      onAddPsqlIndex: addPsqlIndex,
      onDeleteEdge: deleteEdge,
      onDeleteNode: (nodeId: string) => {
        deleteNode(nodeId);
        setSelectedNodeId((current) => (current === nodeId ? null : current));
      },
      onReplaceResourceSchema: replaceResourceSchema,
      onReplaceRestMethodInputs: replaceRestMethodInputs,
      onReplacePsqlColumns: replacePsqlColumns,
      onReplacePsqlEnums: replacePsqlEnums,
      onReplacePsqlForeignKeys: replacePsqlForeignKeys,
      onReplacePsqlIndices: replacePsqlIndices,
      onRemoveRestMethod: removeRestMethod,
      onUpdateEdgeData: updateEdgeData,
      onUpdateNodeData: updateNodeData,
      onUpdatePsqlColumnOptions: updatePsqlColumnOptions,
      onUpdateRestMethod: updateRestMethod,
    }),
    [
      activeDiagram.psqlEnums,
      addResourceSchemaField,
      addRestMethod,
      addRestMethodInput,
      addPsqlColumn,
      addPsqlEnum,
      addPsqlForeignKey,
      addPsqlIndex,
      canvasEdges,
      canvasNodes,
      deleteEdge,
      deleteNode,
      removeRestMethod,
      replaceResourceSchema,
      replaceRestMethodInputs,
      replacePsqlColumns,
      replacePsqlEnums,
      replacePsqlForeignKeys,
      replacePsqlIndices,
      resourceSchemas,
      updateEdgeData,
      updateNodeData,
      updatePsqlColumnOptions,
      updateRestMethod,
    ],
  );

  return (
    <ReactFlowProvider>
      <DiagramProvider value={contextValue}>
        <div className="app-shell">
          <main className="workspace">
            <DiagramCanvas
              edges={canvasEdges}
              mode={canvasMode}
              nodes={canvasNodes}
              onAddNode={addAndSelectNode}
              onConnect={connectNodes}
              onDeleteNode={deleteNode}
              onEdgesChange={onEdgesChange}
              onNodesChange={onNodesChange}
              onSelectEdge={() => {}}
              onSelectNode={setSelectedNodeId}
              onUpdateNodeData={updateNodeData}
            />
          </main>

          <div className="canvas-mode-dock" aria-label="Canvas mode">
            {([
              ["grip", "Grip", "Q"],
              ["select", "Select", "W"],
              ["annotate", "Annotate", "E"],
            ] as const).map(([mode, label, shortcut]) => (
              <button
                key={mode}
                type="button"
                title={`${label} (${shortcut})`}
                className={`canvas-mode-dock__button${
                  canvasMode === mode ? " canvas-mode-dock__button--active" : ""
                }`}
                onClick={() => setCanvasMode(mode)}
              >
                <span>{label}</span>
                <kbd>{shortcut}</kbd>
              </button>
            ))}
          </div>

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
              <button
                aria-label="Open help"
                className="icon-button"
                type="button"
                onClick={() => setHelpOpen(true)}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                >
                  <circle cx="12" cy="12" r="8" />
                  <path strokeLinecap="round" d="M9.8 9.6a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2 1-1.2 1.9" />
                  <path strokeLinecap="round" d="M12 17h.01" />
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
            onExportDiagram={handleExportDiagram}
            onImportEssa={handleImportEssa}
            onRenameDiagram={renameDiagram}
            onSelectDiagram={(diagramId) => {
              selectDiagram(diagramId);
              setSelectedNodeId(null);
            }}
          />
          <HelpModal open={helpOpen} onClose={closeHelp} />
        </div>
      </DiagramProvider>
    </ReactFlowProvider>
  );
};
