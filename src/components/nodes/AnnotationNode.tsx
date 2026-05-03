import type { CSSProperties } from "react";
import type { NodeProps } from "@xyflow/react";
import type { AnnotationData, EssaNode } from "../../domain/types";

type AnnotationNodeProps = NodeProps<EssaNode> & {
  data: AnnotationData;
};

export const AnnotationNode = ({ data }: AnnotationNodeProps) => (
  <article
    className="annotation-node"
    aria-label={data.label || "Annotation"}
    style={{
      "--annotation-color": data.color,
      width: data.width,
      height: data.height,
    } as CSSProperties}
  />
);
