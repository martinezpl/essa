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
import { blockList } from "../domain/model";
import { RestResourceNode } from "./nodes/RestResourceNode";
import { PsqlTableNode } from "./nodes/PsqlTableNode";
import { AnnotationNode } from "./nodes/AnnotationNode";
import { AnimatedEdge } from "./edges/AnimatedEdge";
import type { EdgeRouteObstacle } from "./edges/edgeRouting";
import type { BlockKind, DiagramEdge, DiagramNode } from "../domain/types";

export type CanvasMode = "grip" | "select" | "annotate";
export type CanvasInputMode = "touchpad" | "mouse";

type DiagramCanvasProps = {
  edges: DiagramEdge[];
  inputMode: CanvasInputMode;
  mode: CanvasMode;
  nodes: DiagramNode[];
  onAddNode: (
    kind: BlockKind,
    position?: { x: number; y: number },
    dataPatch?: Partial<DiagramNode["data"]>,
  ) => string;
  onConnect: (sourceId?: string | null, targetId?: string | null) => void;
  onEdgesChange: (changes: EdgeChange<DiagramEdge>[]) => void;
  onNodesChange: (changes: NodeChange<DiagramNode>[]) => void;
  onDeleteNode: (nodeId: string) => void;
  onSelectEdge: (edgeId: string | null) => void;
  onSelectNode: (nodeId: string | null) => void;
  onUpdateNodeData: (nodeId: string, data: Partial<DiagramNode["data"]>) => void;
};

const nodeTypes = {
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
const MINIMAP_WIDTH = 320;
const MINIMAP_HEIGHT = 190;
const MINIMAP_PADDING = 18;

type LayoutDiagramNode = DiagramNode & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

type AnnotationDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "annotation" }>;
};

type AnnotationResizeDraft = {
  height: number;
  id: string;
  startHeight: number;
  startWidth: number;
  startX: number;
  startY: number;
  width: number;
};

const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 420;
const MIN_ANNOTATION_SIZE = 24;
const WHEEL_LINE_HEIGHT = 16;

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

const getNodeObstacle = (node: DiagramNode): EdgeRouteObstacle => {
  const layoutNode = node as LayoutDiagramNode;
  const width = layoutNode.measured?.width ??
    layoutNode.width ??
    (node.data.kind === "annotation"
      ? node.data.width
      : DEFAULT_NODE_WIDTH);
  const height = layoutNode.measured?.height ??
    layoutNode.height ??
    (node.data.kind === "annotation"
      ? node.data.height
      : DEFAULT_NODE_HEIGHT);

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
  inputMode,
  mode,
  nodes,
  onAddNode,
  onConnect,
  onDeleteNode,
  onEdgesChange,
  onNodesChange,
  onSelectEdge,
  onSelectNode,
  onUpdateNodeData,
}: DiagramCanvasProps) => {
  const { screenToFlowPosition, setCenter, setViewport } = useReactFlow();
  const viewport = useViewport();
  const width = useStore((state) => state.width);
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
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [annotationResizeDraft, setAnnotationResizeDraft] =
    useState<AnnotationResizeDraft | null>(null);
  const annotationNameInputRef = useRef<HTMLInputElement | null>(null);
  const ignoreNextPaneClickRef = useRef(false);

  const renderedEdges = useMemo(() => {
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );
    const obstacles = nodes
      .filter((node) => node.data.kind !== "annotation")
      .map(getNodeObstacle);

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
          width: Math.max(
            MIN_ANNOTATION_SIZE,
            current.startWidth + (event.clientX - current.startX) / viewport.zoom,
          ),
          height: Math.max(
            MIN_ANNOTATION_SIZE,
            current.startHeight + (event.clientY - current.startY) / viewport.zoom,
          ),
        };
      });
    };

    const handlePointerUp = (event: PointerEvent) => {
      const width = Math.max(
        MIN_ANNOTATION_SIZE,
        resizeDraft.startWidth +
          (event.clientX - resizeDraft.startX) / viewport.zoom,
      );
      const height = Math.max(
        MIN_ANNOTATION_SIZE,
        resizeDraft.startHeight +
          (event.clientY - resizeDraft.startY) / viewport.zoom,
      );

      onUpdateNodeData(resizeDraft.id, {
        width,
        height,
      });
      setAnnotationResizeDraft(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [annotationResizeDraft, onUpdateNodeData, viewport.zoom]);
  const createAnnotationFromDraft = (event: ReactMouseEvent<HTMLDivElement>) => {
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

    const nodeId = onAddNode("annotation", { x: left, y: top }, { width, height });
    ignoreNextPaneClickRef.current = true;
    setEditingAnnotationId(nodeId);
  };
  const findAnnotationAtPoint = (point: { x: number; y: number }) =>
    [...nodes]
      .reverse()
      .find((node) => {
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
      className={`canvas-shell canvas-shell--${mode}`}
      onWheelCapture={handleCanvasWheelCapture}
      onDoubleClickCapture={(event) => {
        if (mode !== "select") {
          return;
        }

        const target = event.target;

        if (
          target instanceof HTMLElement &&
          target.closest(
            ".react-flow__node:not(.react-flow__node-annotation), .react-flow__controls, .canvas-minimap, .canvas-context-menu, .annotation-editor",
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
        nodes={nodes}
        panOnDrag={mode === "grip"}
        selectionOnDrag={mode === "select"}
        zoomOnDoubleClick={mode !== "select"}
        zoomOnPinch
        zoomOnScroll
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
          if (ignoreNextPaneClickRef.current) {
            ignoreNextPaneClickRef.current = false;
            return;
          }

          setContextMenu(null);
          setEditingAnnotationId(null);
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
      {editingAnnotation && editingAnnotationBounds && editingAnnotationWidth && editingAnnotationHeight ? (
        <div
          className="annotation-edit-frame"
          style={{
            left: editingAnnotationBounds.left * viewport.zoom + viewport.x,
            top: editingAnnotationBounds.top * viewport.zoom + viewport.y,
            width: editingAnnotationWidth * viewport.zoom,
            height: editingAnnotationHeight * viewport.zoom,
          }}
        >
          <button
            type="button"
            aria-label="Resize annotation"
            className="annotation-edit-frame__resize"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setAnnotationResizeDraft({
                id: editingAnnotation.id,
                startX: event.clientX,
                startY: event.clientY,
                startWidth: editingAnnotationWidth,
                startHeight: editingAnnotationHeight,
                width: editingAnnotationWidth,
                height: editingAnnotationHeight,
              });
            }}
          />
          <div className="annotation-editor nodrag nowheel">
            <label className="annotation-editor__field">
              <span>Name</span>
              <input
                ref={annotationNameInputRef}
                aria-label="Annotation name"
                type="text"
                value={editingAnnotation.data.label}
                onChange={(event) =>
                  onUpdateNodeData(editingAnnotation.id, { label: event.target.value })
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
                  onUpdateNodeData(editingAnnotation.id, { color: event.target.value })
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
              <span className={`floating-dock__dot floating-dock__dot--${kind}`} />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
