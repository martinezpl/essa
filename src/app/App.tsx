import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import {
  DiagramCanvas,
  type CanvasInputMode,
  type CanvasMode,
} from "../components/DiagramCanvas";
import { DiagramSidebar } from "../components/DiagramSidebar";
import { CanvasMinimap } from "../components/CanvasMinimap";
import { HelpModal } from "../components/HelpModal";
import { PerfOverlay, isPerfOverlayEnabled } from "../components/PerfOverlay";
import { ThemeToggle } from "../components/ThemeToggle";
import {
  parseEssaDiagram,
  serializeEssaDiagram,
  serializeMarkdownDiagram,
} from "../domain/diagramExport";
import {
  createDiagramShareHash,
  DIAGRAM_SHARE_HASH_PARAM,
  parseDiagramShareHash,
} from "../domain/diagramShare";
import { deriveResourceSchemas } from "../domain/resourceSchema";
import {
  psqlColumnSourceHandleId,
  psqlForeignKeyTargetHandleId,
} from "../domain/psqlForeignKeys";
import type { Diagram, DiagramEdge, DiagramNode } from "../domain/types";
import { DiagramProvider } from "./diagramContext";
import { useDiagramStore } from "./useDiagramStore";
import { useTheme } from "./useTheme";

type PsqlTableDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

type DiagramExportFormat = "essa" | "markdown";
type ShareStatus = "idle" | "copied" | "failed";

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

const perfOverlayEnabled = isPerfOverlayEnabled();

export const App = () => {
  const [canvasMode, setCanvasMode] = useState<CanvasMode>("grip");
  const [canvasInputMode, setCanvasInputMode] =
    useState<CanvasInputMode>("touchpad");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(() => !hasHelpCookie());
  const [minimapHovered, setMinimapHovered] = useState(false);
  const [copiedNodes, setCopiedNodes] = useState<DiagramNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const copiedNodesRef = useRef<DiagramNode[]>([]);
  const shareStatusTimeoutRef = useRef<number | null>(null);
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
        const targetColumn =
          targetTable?.data.kind === "psqlTable" &&
          targetTable.data.primaryKey.includes(foreignKey.targetColumnId)
            ? targetTable.data.columns.find(
                (column) => column.id === foreignKey.targetColumnId,
              )
            : undefined;

        if (!targetTable || !targetColumn) {
          return [];
        }

        return [
          {
            id: `fk-edge-${node.id}-${foreignKey.id}`,
            source: foreignKey.targetTableId,
            sourceHandle: psqlColumnSourceHandleId(foreignKey.targetColumnId),
            target: node.id,
            targetHandle: psqlForeignKeyTargetHandleId(foreignKey.id),
            type: "smoothstep",
            data: {
              kind: "read",
              dataPath: "FK",
              readonly: true,
            } as DiagramEdge["data"],
          },
        ];
      });
    });

    return [...activeDiagram.edges, ...foreignKeyEdges];
  }, [activeDiagram.edges, activeDiagram.nodes]);

  const selectedNodes = useMemo(() => {
    const selected = activeDiagram.nodes.filter((node) => node.selected);
    const fallback = selectedNodeId
      ? activeDiagram.nodes.find((node) => node.id === selectedNodeId)
      : null;

    return selected.length > 0 ? selected : fallback ? [fallback] : [];
  }, [activeDiagram.nodes, selectedNodeId]);

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

  const resetShareStatusSoon = useCallback((status: ShareStatus) => {
    setShareStatus(status);

    if (shareStatusTimeoutRef.current !== null) {
      window.clearTimeout(shareStatusTimeoutRef.current);
    }

    shareStatusTimeoutRef.current = window.setTimeout(() => {
      setShareStatus("idle");
      shareStatusTimeoutRef.current = null;
    }, 1800);
  }, []);

  const handleShareDiagram = useCallback(async () => {
    const url = new URL(window.location.href);
    url.hash = createDiagramShareHash(activeDiagram);

    try {
      await navigator.clipboard.writeText(url.toString());
      resetShareStatusSoon("copied");
    } catch {
      resetShareStatusSoon("failed");
    }
  }, [activeDiagram, resetShareStatusSoon]);

  const closeHelp = useCallback(() => {
    setHelpCookie();
    setHelpOpen(false);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));

    if (!params.has(DIAGRAM_SHARE_HASH_PARAM)) {
      return;
    }

    try {
      const diagram = parseDiagramShareHash(window.location.hash);

      if (diagram) {
        importDiagram(diagram);
        setSelectedNodeId(null);
      }
    } catch {
      window.alert("Could not import this shared diagram link.");
    } finally {
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${window.location.search}`,
      );
    }
  }, [importDiagram]);

  useEffect(
    () => () => {
      if (shareStatusTimeoutRef.current !== null) {
        window.clearTimeout(shareStatusTimeoutRef.current);
      }
    },
    [],
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
      const key = event.key.toLowerCase();

      if (
        !isModifierPressed &&
        !event.altKey &&
        !isEditableTarget(event.target)
      ) {
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

      if (
        !isModifierPressed ||
        event.altKey ||
        isEditableTarget(event.target)
      ) {
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
        const nextCopiedNodes =
          currentCopiedNodes.length === 1
            ? [duplicateNode(currentCopiedNodes[0])].map((nodeId) => ({
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
              inputMode={canvasInputMode}
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
            <div className="canvas-mode-dock__section">
              {(
                [
                  ["grip", "Grip", "Q"],
                  ["select", "Select", "W"],
                  ["annotate", "Annotate", "E"],
                ] as const
              ).map(([mode, label, shortcut]) => (
                <button
                  key={mode}
                  type="button"
                  title={`${label} (${shortcut})`}
                  className={`canvas-mode-dock__button${
                    canvasMode === mode
                      ? " canvas-mode-dock__button--active"
                      : ""
                  }`}
                  onClick={() => setCanvasMode(mode)}
                >
                  <span>{label}</span>
                  <kbd>{shortcut}</kbd>
                </button>
              ))}
            </div>
            <div
              className="canvas-mode-dock__section canvas-mode-dock__section--input"
              aria-label="Input mode"
            >
              <button
                type="button"
                title={`Input mode: ${canvasInputMode}`}
                className="canvas-mode-dock__button canvas-mode-dock__button--active"
                onClick={() =>
                  setCanvasInputMode((current) =>
                    current === "touchpad" ? "mouse" : "touchpad",
                  )
                }
              >
                <span>
                  {canvasInputMode === "touchpad" ? "Touchpad" : "Mouse"}
                </span>
              </button>
            </div>
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
                  <path
                    strokeLinecap="round"
                    d="M9.8 9.6a2.4 2.4 0 1 1 3.4 2.2c-.8.4-1.2 1-1.2 1.9"
                  />
                  <path strokeLinecap="round" d="M12 17h.01" />
                </svg>
              </button>
              <a
                aria-label="Open GitHub repository"
                className="icon-button"
                href="https://github.com/martinezpl/essa"
                rel="noreferrer"
                target="_blank"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.84 9.73.5.09.68-.22.68-.49 0-.24-.01-.88-.01-1.73-2.78.62-3.37-1.38-3.37-1.38-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.89 1.56 2.34 1.11 2.91.85.09-.66.35-1.11.63-1.36-2.22-.26-4.55-1.14-4.55-5.07 0-1.12.39-2.03 1.03-2.75-.1-.26-.45-1.3.1-2.71 0 0 .84-.28 2.75 1.05A9.27 9.27 0 0 1 12 6.98c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.05 2.75-1.05.55 1.41.2 2.45.1 2.71.64.72 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.95.68 1.92 0 1.38-.01 2.49-.01 2.83 0 .27.18.59.69.49A10.24 10.24 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z" />
                </svg>
              </a>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
              <div className="diagram-actions">
                <div className="diagram-title">
                  <span className="eyebrow">Diagram</span>
                  <h2>{activeDiagram.name}</h2>
                </div>
                <button
                  aria-label={
                    shareStatus === "copied"
                      ? "Share link copied"
                      : shareStatus === "failed"
                        ? "Could not copy share link"
                        : `Copy share link for ${activeDiagram.name}`
                  }
                  className={`diagram-actions__share${
                    shareStatus === "copied"
                      ? " diagram-actions__share--copied"
                      : shareStatus === "failed"
                        ? " diagram-actions__share--failed"
                        : ""
                  }`}
                  title={
                    shareStatus === "copied"
                      ? "Copied"
                      : shareStatus === "failed"
                        ? "Copy failed"
                        : "Copy share link"
                  }
                  type="button"
                  onClick={handleShareDiagram}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.5 13.5 13.5 10.5"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M8.4 11.6 6.8 13.2a3.4 3.4 0 0 0 4.8 4.8l2.4-2.4a3.4 3.4 0 0 0 0-4.8"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15.6 12.4 17.2 10.8a3.4 3.4 0 0 0-4.8-4.8L10 8.4a3.4 3.4 0 0 0 0 4.8"
                    />
                  </svg>
                </button>
                <select
                  aria-label={`Export ${activeDiagram.name}`}
                  className="diagram-actions__export"
                  value=""
                  onChange={(event) => {
                    const format = event.target.value as DiagramExportFormat;

                    if (format) {
                      handleExportDiagram(activeDiagram, format);
                    }
                  }}
                >
                  <option value="" disabled>
                    Export as...
                  </option>
                  <option value="essa">.essa</option>
                  <option value="markdown">.md</option>
                </select>
              </div>
            </div>
            <div className="app-topbar__right">
              <div
                className={`minimap-shell${
                  minimapHovered ? " minimap-shell--expanded" : ""
                }`}
                onMouseEnter={() => setMinimapHovered(true)}
                onMouseLeave={() => setMinimapHovered(false)}
              >
                <button
                  aria-label={
                    minimapHovered
                      ? "Click minimap to recenter canvas"
                      : "Show minimap"
                  }
                  aria-expanded={minimapHovered}
                  className="minimap-button"
                  type="button"
                  onFocus={() => setMinimapHovered(true)}
                  onBlur={() => setMinimapHovered(false)}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    aria-hidden="true"
                    className="minimap-button__icon"
                  >
                    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
                    <path
                      strokeLinecap="round"
                      d="M8 5.5v13M16 5.5v13M3.5 10h17M3.5 14h17"
                    />
                  </svg>
                  {minimapHovered ? (
                    <CanvasMinimap
                      className="minimap-overlay"
                      edges={canvasEdges}
                      nodes={canvasNodes}
                    />
                  ) : null}
                </button>
              </div>
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
            onImportEssa={handleImportEssa}
            onRenameDiagram={renameDiagram}
            onSelectDiagram={(diagramId) => {
              selectDiagram(diagramId);
              setSelectedNodeId(null);
            }}
          />
          <HelpModal open={helpOpen} onClose={closeHelp} />
          {perfOverlayEnabled ? (
            <PerfOverlay
              nodeCount={canvasNodes.length}
              edgeCount={canvasEdges.length}
            />
          ) : null}
        </div>
      </DiagramProvider>
    </ReactFlowProvider>
  );
};
