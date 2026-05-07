import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
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
import {
  getAllConnectionEndpoints,
  getCompatibleEndpointConnection,
  getConnectionEndpointByHandle,
} from "../domain/connectionEndpoints";
import { blockList } from "../domain/model";
import { AppViewNode } from "./nodes/AppViewNode";
import { RestResourceNode } from "./nodes/RestResourceNode";
import { PsqlTableNode } from "./nodes/PsqlTableNode";
import { AnnotationNode } from "./nodes/AnnotationNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import { getNodeObstacle } from "./canvasObstacle";
import type { CanvasNodeKind, DiagramEdge, DiagramNode } from "../domain/types";

export type CanvasMode = "grip" | "select" | "annotate";
export type CanvasInputMode = "touchpad" | "mouse";

type DiagramCanvasProps = {
  edges: DiagramEdge[];
  inputMode: CanvasInputMode;
  mode: CanvasMode;
  nodes: DiagramNode[];
  onAddNode: (
    kind: CanvasNodeKind,
    position?: { x: number; y: number },
    dataPatch?: Partial<DiagramNode["data"]>,
  ) => string;
  onConnect: (
    sourceId?: string | null,
    targetId?: string | null,
    sourceHandle?: string | null,
    targetHandle?: string | null,
  ) => void;
  onEdgesChange: (changes: EdgeChange<DiagramEdge>[]) => void;
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onSelectNode: (nodeId: string | null) => void;
  onResizeAnnotation: (
    nodeId: string,
    frame: {
      height: number;
      left: number;
      top: number;
      width: number;
    },
  ) => void;
  onUpdateNodeData: (
    nodeId: string,
    data: Partial<DiagramNode["data"]>,
  ) => void;
};

const nodeTypes = {
  appView: AppViewNode,
  restResource: RestResourceNode,
  psqlTable: PsqlTableNode,
  annotation: AnnotationNode,
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

type AnnotationDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "annotation" }>;
};

type AnnotationResizeDirection =
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "nw";

type AnnotationResizeDraft = {
  direction: AnnotationResizeDirection;
  height: number;
  id: string;
  left: number;
  startHeight: number;
  startLeft: number;
  startTop: number;
  startWidth: number;
  startX: number;
  startY: number;
  top: number;
  width: number;
};

type ConnectionDragState = {
  activeEndpointId: string;
  validTargetEndpointIds: string[];
};

const MIN_ANNOTATION_SIZE = 24;
const WHEEL_LINE_HEIGHT = 16;
const annotationResizeDirections: AnnotationResizeDirection[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

const getResizedAnnotationFrame = (
  draft: AnnotationResizeDraft,
  clientX: number,
  clientY: number,
  zoom: number,
) => {
  const deltaX = (clientX - draft.startX) / zoom;
  const deltaY = (clientY - draft.startY) / zoom;
  const frame = {
    left: draft.startLeft,
    top: draft.startTop,
    width: draft.startWidth,
    height: draft.startHeight,
  };

  if (draft.direction.includes("e")) {
    frame.width = Math.max(MIN_ANNOTATION_SIZE, draft.startWidth + deltaX);
  }

  if (draft.direction.includes("s")) {
    frame.height = Math.max(MIN_ANNOTATION_SIZE, draft.startHeight + deltaY);
  }

  if (draft.direction.includes("w")) {
    frame.width = Math.max(MIN_ANNOTATION_SIZE, draft.startWidth - deltaX);
    frame.left = draft.startLeft + draft.startWidth - frame.width;
  }

  if (draft.direction.includes("n")) {
    frame.height = Math.max(MIN_ANNOTATION_SIZE, draft.startHeight - deltaY);
    frame.top = draft.startTop + draft.startHeight - frame.height;
  }

  return frame;
};

const getWheelDeltaScale = (
  event: ReactWheelEvent<HTMLDivElement>,
  viewportHeight: number,
) => {
  if (event.deltaMode === globalThis.WheelEvent.DOM_DELTA_LINE) {
    return WHEEL_LINE_HEIGHT;
  }

  if (event.deltaMode === globalThis.WheelEvent.DOM_DELTA_PAGE) {
    return viewportHeight;
  }

  return 1;
};

const shouldIgnoreCanvasWheel = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(
    target.closest(
      ".nowheel, input, textarea, select, [contenteditable='true'], [contenteditable='']",
    ),
  );

export const DiagramCanvas = ({
  edges,
  inputMode,
  mode,
  nodes,
  onAddNode,
  onConnect,
  onDeleteNode,
  onEdgesChange,
  onNodesChange,
  onResizeAnnotation,
  onSelectEdge,
  onSelectNode,
  onUpdateNodeData,
}: DiagramCanvasProps) => {
  const { screenToFlowPosition, setViewport } = useReactFlow();
  const viewport = useViewport();
  const height = useStore((state) => state.height);
  const [contextMenu, setContextMenu] = useState<{
    left: number;
    top: number;
    position: { x: number; y: number };
  } | null>(null);
  const [annotationDraft, setAnnotationDraft] = useState<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(
    null,
  );
  const [annotationResizeDraft, setAnnotationResizeDraft] =
    useState<AnnotationResizeDraft | null>(null);
  const [connectionDrag, setConnectionDrag] =
    useState<ConnectionDragState | null>(null);
  const annotationNameInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextPaneClickRef = useRef(false);

  const renderedNodes = useMemo<DiagramNode[]>(() => {
    if (!connectionDrag) {
      return nodes;
    }

    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        __connectionUx: {
          activeEndpointId: connectionDrag.activeEndpointId,
          dragging: true,
          validTargetEndpointIds: connectionDrag.validTargetEndpointIds,
        },
      } as unknown as DiagramNode["data"],
    }));
  }, [connectionDrag, nodes]);

  const renderedEdges = useMemo(() => {
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );

    return edges.map((edge) => ({
      ...edge,
      type: "default" as const,
      data: {
        ...edge.data,
        linked:
          selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target),
      },
    }));
  }, [edges, nodes]);
  const annotationPreview = annotationDraft
    ? {
        left: Math.min(annotationDraft.start.x, annotationDraft.current.x),
        top: Math.min(annotationDraft.start.y, annotationDraft.current.y),
        width: Math.abs(annotationDraft.current.x - annotationDraft.start.x),
        height: Math.abs(annotationDraft.current.y - annotationDraft.start.y),
      }
    : null;
  const editingAnnotation = nodes.find(
    (node): node is AnnotationDiagramNode =>
      node.id === editingAnnotationId && node.data.kind === "annotation",
  );
  const editingAnnotationBounds = editingAnnotation
    ? getNodeObstacle(editingAnnotation)
    : null;
  const isResizingEditingAnnotation =
    Boolean(annotationResizeDraft && editingAnnotation) &&
    annotationResizeDraft?.id === editingAnnotation?.id;
  const editingAnnotationLeft =
    isResizingEditingAnnotation && annotationResizeDraft
      ? annotationResizeDraft.left
      : editingAnnotationBounds?.left;
  const editingAnnotationTop =
    isResizingEditingAnnotation && annotationResizeDraft
      ? annotationResizeDraft.top
      : editingAnnotationBounds?.top;
  const editingAnnotationWidth =
    isResizingEditingAnnotation && annotationResizeDraft
      ? annotationResizeDraft.width
      : editingAnnotation?.data.width;
  const editingAnnotationHeight =
    isResizingEditingAnnotation && annotationResizeDraft
      ? annotationResizeDraft.height
      : editingAnnotation?.data.height;

  useEffect(() => {
    if (!editingAnnotation) {
      return;
    }

    annotationNameInputRef.current?.focus();
    annotationNameInputRef.current?.select();
  }, [editingAnnotation?.id]);

  useEffect(() => {
    if (!annotationResizeDraft) {
      return;
    }

    const resizeDraft = annotationResizeDraft;

    const handlePointerMove = (event: PointerEvent) => {
      setAnnotationResizeDraft((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          ...getResizedAnnotationFrame(
            current,
            event.clientX,
            event.clientY,
            viewport.zoom,
          ),
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const frame = getResizedAnnotationFrame(
        resizeDraft,
        event.clientX,
        event.clientY,
        viewport.zoom,
      );

      onResizeAnnotation(resizeDraft.id, frame);
      setAnnotationResizeDraft(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [annotationResizeDraft, onResizeAnnotation, viewport.zoom]);
  const createAnnotationFromDraft = (
    event: ReactMouseEvent<HTMLDivElement>,
  ) => {
    if (!annotationDraft) {
      return;
    }

    const end = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const left = Math.min(annotationDraft.start.x, end.x);
    const top = Math.min(annotationDraft.start.y, end.y);
    const width = Math.abs(end.x - annotationDraft.start.x);
    const height = Math.abs(end.y - annotationDraft.start.y);
    setAnnotationDraft(null);

    if (width < MIN_ANNOTATION_SIZE || height < MIN_ANNOTATION_SIZE) {
      return;
    }

    const nodeId = onAddNode(
      "annotation",
      { x: left, y: top },
      { width, height },
    );
    ignoreNextPaneClickRef.current = true;
    setEditingAnnotationId(nodeId);
  };
  const findAnnotationAtPoint = (point: { x: number; y: number }) =>
    [...nodes].reverse().find((node) => {
      if (node.data.kind !== "annotation") {
        return false;
      }

      const bounds = getNodeObstacle(node);

      return (
        point.x >= bounds.left &&
        point.x <= bounds.right &&
        point.y >= bounds.top &&
        point.y <= bounds.bottom
      );
    });
  const handleCanvasWheelCapture = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (
      inputMode !== "touchpad" ||
      event.ctrlKey ||
      event.metaKey ||
      shouldIgnoreCanvasWheel(event.target)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const deltaScale = getWheelDeltaScale(event, height);
    setViewport({
      x: viewport.x - event.deltaX * deltaScale,
      y: viewport.y - event.deltaY * deltaScale,
      zoom: viewport.zoom,
    });
  };

  return (
    <div
      className={`canvas-shell canvas-shell--${mode}${
        connectionDrag ? " canvas-shell--connecting" : ""
      }`}
      onWheelCapture={handleCanvasWheelCapture}
      onClickCapture={(event) => {
        if (mode !== "select") {
          return;
        }

        const target = event.target;

        if (
          target instanceof HTMLElement &&
          target.closest(
            ".react-flow__node:not(.react-flow__node-annotation), .react-flow__controls, .canvas-minimap, .canvas-context-menu, .annotation-editor, .annotation-edit-frame",
          )
        ) {
          return;
        }

        const annotation = findAnnotationAtPoint(
          screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        );

        if (!annotation) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        setContextMenu(null);
        onSelectEdge(null);
        onSelectNode(null);
        setEditingAnnotationId(annotation.id);
      }}
      onMouseMove={(event) => {
        if (!annotationDraft) {
          return;
        }

        setAnnotationDraft({
          ...annotationDraft,
          current: screenToFlowPosition({ x: event.clientX, y: event.clientY }),
        });
      }}
      onMouseDown={(event) => {
        if (mode !== "annotate" || annotationDraft) {
          return;
        }

        const target = event.target;

        if (
          target instanceof HTMLElement &&
          target.closest(
            ".react-flow__node, .react-flow__controls, .canvas-minimap, .canvas-context-menu, .annotation-edit-frame",
          )
        ) {
          return;
        }

        const start = screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        setAnnotationDraft({ start, current: start });
      }}
      onMouseUp={createAnnotationFromDraft}
    >
      <ReactFlow
        fitView
        fitViewOptions={fitViewOptions}
        edges={renderedEdges}
        maxZoom={MAX_ZOOM}
        minZoom={MIN_ZOOM}
        multiSelectionKeyCode={["Meta", "Control", "Shift"]}
        nodes={renderedNodes}
        panOnDrag={mode === "grip"}
        selectionOnDrag={mode === "select"}
        zoomOnDoubleClick={mode !== "select"}
        zoomOnPinch
        zoomOnScroll
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        proOptions={{ hideAttribution: true }}
        onConnect={(connection: Connection) =>
          {
            setConnectionDrag(null);
            onConnect(
            connection.source,
            connection.target,
            connection.sourceHandle,
            connection.targetHandle,
            );
          }
        }
        onConnectStart={(_, params) => {
          if (params.handleType !== "source") {
            setConnectionDrag(null);
            return;
          }

          const sourceEndpoint = getConnectionEndpointByHandle(
            nodes,
            params.nodeId,
            params.handleId,
            "output",
          );

          if (!sourceEndpoint) {
            setConnectionDrag(null);
            return;
          }

          const validTargetEndpointIds = getAllConnectionEndpoints(nodes)
            .filter((endpoint) => endpoint.direction === "input")
            .filter((endpoint) =>
              getCompatibleEndpointConnection(sourceEndpoint, endpoint, nodes),
            )
            .map((endpoint) => endpoint.id);

          setConnectionDrag({
            activeEndpointId: sourceEndpoint.id,
            validTargetEndpointIds,
          });
        }}
        onConnectEnd={() => setConnectionDrag(null)}
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
          if (ignoreNextPaneClickRef.current) {
            ignoreNextPaneClickRef.current = false;
            return;
          }

          setContextMenu(null);
          setEditingAnnotationId(null);
          onSelectEdge(null);

          onSelectNode(null);
        }}
        onNodeContextMenu={(event, node) => {
          if (node.type !== "annotation") return;
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
      {annotationPreview ? (
        <div
          className="annotation-preview"
          style={{
            transform: `translate(${annotationPreview.left * viewport.zoom + viewport.x}px, ${
              annotationPreview.top * viewport.zoom + viewport.y
            }px)`,
            width: annotationPreview.width * viewport.zoom,
            height: annotationPreview.height * viewport.zoom,
          }}
        />
      ) : null}
      {editingAnnotation &&
      editingAnnotationBounds &&
      editingAnnotationLeft !== undefined &&
      editingAnnotationTop !== undefined &&
      editingAnnotationWidth &&
      editingAnnotationHeight ? (
        <div
          className="annotation-edit-frame"
          style={{
            left: editingAnnotationLeft * viewport.zoom + viewport.x,
            top: editingAnnotationTop * viewport.zoom + viewport.y,
            width: editingAnnotationWidth * viewport.zoom,
            height: editingAnnotationHeight * viewport.zoom,
          }}
        >
          {annotationResizeDirections.map((direction) => (
            <button
              key={direction}
              type="button"
              aria-label={`Resize annotation ${direction}`}
              className={`annotation-edit-frame__resize annotation-edit-frame__resize--${direction}`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setAnnotationResizeDraft({
                  direction,
                  id: editingAnnotation.id,
                  left: editingAnnotationLeft,
                  top: editingAnnotationTop,
                  startX: event.clientX,
                  startY: event.clientY,
                  startLeft: editingAnnotationLeft,
                  startTop: editingAnnotationTop,
                  startWidth: editingAnnotationWidth,
                  startHeight: editingAnnotationHeight,
                  width: editingAnnotationWidth,
                  height: editingAnnotationHeight,
                });
              }}
            />
          ))}
          <div className="annotation-editor nodrag nowheel">
            <label className="annotation-editor__field">
              <span>Name</span>
              <input
                ref={annotationNameInputRef}
                aria-label="Annotation name"
                type="text"
                value={editingAnnotation.data.label}
                onChange={(event) =>
                  onUpdateNodeData(editingAnnotation.id, {
                    label: event.target.value,
                  })
                }
              />
            </label>
            <label className="annotation-editor__field annotation-editor__field--color">
              <span>Color</span>
              <input
                aria-label="Annotation color"
                type="color"
                value={editingAnnotation.data.color}
                onChange={(event) =>
                  onUpdateNodeData(editingAnnotation.id, {
                    color: event.target.value,
                  })
                }
              />
            </label>
            <button
              type="button"
              className="annotation-editor__delete"
              onClick={() => {
                onDeleteNode(editingAnnotation.id);
                setEditingAnnotationId(null);
              }}
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
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
              <span
                className={`floating-dock__dot floating-dock__dot--${kind}`}
              />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
