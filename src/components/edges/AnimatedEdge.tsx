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

type AnimatedEdgeProps = EdgeProps<EssaEdge>;

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
  const [path, labelX, labelY] = getBezierPath({
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
  const kindClass = `essa-edge--${kind}`;
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
