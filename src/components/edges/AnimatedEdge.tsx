import {
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type {
  ConnectionKind,
  DiagramEdge,
  EssaEdge,
} from "../../domain/types";
import { ConnectionEditor } from "../blockEditors/ConnectionEditor";
import {
  routeEdgeAroundObstacles,
  type EdgeRouteObstacle,
} from "./edgeRouting";

type AnimatedEdgeProps = EdgeProps<EssaEdge>;

const isObstacle = (value: unknown): value is EdgeRouteObstacle => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const obstacle = value as Record<string, unknown>;

  return typeof obstacle.id === "string" &&
    typeof obstacle.left === "number" &&
    typeof obstacle.top === "number" &&
    typeof obstacle.right === "number" &&
    typeof obstacle.bottom === "number";
};

const getObstacles = (value: unknown): EdgeRouteObstacle[] =>
  Array.isArray(value) ? value.filter(isObstacle) : [];

const getObstacle = (value: unknown): EdgeRouteObstacle | undefined =>
  isObstacle(value) ? value : undefined;

export const AnimatedEdge = ({
  id,
  source,
  target,
  type,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: AnimatedEdgeProps) => {
  const [fallbackPath, fallbackLabelX, fallbackLabelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const kind: ConnectionKind = (data?.kind as ConnectionKind) ?? "read";
  const dataPath = (data?.dataPath as string | undefined) ?? "all";
  const linked = Boolean(data?.linked);
  const readonly = Boolean(data?.readonly);
  const routedEdge = routeEdgeAroundObstacles({
    source: { x: sourceX, y: sourceY },
    sourcePosition,
    target: { x: targetX, y: targetY },
    targetPosition,
    obstacles: getObstacles(data?.obstacles),
    sourceObstacle: getObstacle(data?.sourceObstacle),
    targetObstacle: getObstacle(data?.targetObstacle),
  });
  const path = routedEdge?.path ?? fallbackPath;
  const labelX = routedEdge?.labelX ?? fallbackLabelX;
  const labelY = routedEdge?.labelY ?? fallbackLabelY;
  const kindClass = `essa-edge--${kind.replace("/", "-")}`;
  const stateClass = selected ? " essa-edge--selected" : "";
  const linkedClass = linked ? " essa-edge--linked" : "";

  const fullEdge: DiagramEdge = {
    id,
    source,
    target,
    type,
    data: { kind, dataPath },
  };

  return (
    <g className={`essa-edge ${kindClass}${stateClass}${linkedClass}`}>
      <path className="essa-edge__hit" d={path} />
      <path className="essa-edge__path" d={path} />
      <path className="essa-edge__flow" d={path} />
      <EdgeLabelRenderer>
        {selected && !readonly ? (
          <div
            className="nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
              zIndex: 5,
            }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <ConnectionEditor edge={fullEdge} />
          </div>
        ) : (
          <div
            className="essa-edge__label"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            <span className="essa-edge__label-kind">{kind}</span>
            <span className="essa-edge__label-data">{dataPath}</span>
          </div>
        )}
      </EdgeLabelRenderer>
    </g>
  );
};
