import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { EssaNode, RestResourceData } from "../../domain/types";

type RestResourceNodeProps = NodeProps<EssaNode> & {
  data: RestResourceData;
};

export const RestResourceNode = ({ data }: RestResourceNodeProps) => (
  <article className="block-node block-node--resource">
    <Handle type="target" position={Position.Left} />
    <Handle type="source" position={Position.Right} />
    <span className="block-node__type">Resource</span>
    <h3>{data.resourceName ? `/${data.resourceName}` : "No resource set"}</h3>
    <div className="method-list">
      {data.methods.map((method) => (
        <span key={method.id}>
          {method.kind}
          {method.output.returnsArray ? "[]" : ""}
        </span>
      ))}
    </div>
    {data.schema.length > 0 ? (
      <ul>
        {data.schema.map((field) => (
          <li key={`${field.sourceTableId}-${field.sourceColumnId}`}>
            <strong>{field.name}</strong>
            <span>{field.type}</span>
          </li>
        ))}
      </ul>
    ) : null}
  </article>
);
