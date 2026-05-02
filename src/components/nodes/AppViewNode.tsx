import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { AppViewData, EssaNode } from "../../domain/types";

type AppViewNodeProps = NodeProps<EssaNode> & {
  data: AppViewData;
};

export const AppViewNode = ({ data }: AppViewNodeProps) => (
  <article className="block-node block-node--view">
    <Handle type="source" position={Position.Right} />
    <span className="block-node__type">App View</span>
    <h3>{data.route || "No route set"}</h3>
    <ul>
      {data.components.map((component) => (
        <li key={component.id}>
          <strong>{component.name || "Untitled component"}</strong>
          <span>
            {component.dataUsage
              ? `${component.dataUsage.operation} ${component.dataUsage.dataPath}`
              : "No data"}
          </span>
        </li>
      ))}
    </ul>
  </article>
);
