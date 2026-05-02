import { NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import type { EssaNode, RestResourceData } from "../../domain/types";
import { RestResourceEditor } from "../blockEditors/RestResourceEditor";
import { httpVerbClass } from "../blockEditors/helpers";
import { BlockHandles } from "./BlockHandles";

type RestResourceNodeProps = NodeProps<EssaNode> & {
  data: RestResourceData;
};

export const RestResourceNode = ({ id, data, selected }: RestResourceNodeProps) => (
  <>
    <article className="block-node block-node--resource">
      <BlockHandles kind="restResource" />
      <header className="block-node__head">
        <span className="block-node__badge">Resource</span>
      </header>
      <h3
        className={`block-node__title${
          data.resourceName ? "" : " block-node__title--placeholder"
        }`}
      >
        {data.resourceName ? `/${data.resourceName}` : "no resource"}
      </h3>
      {data.methods.length > 0 ? (
        <div className="method-list">
          {data.methods.map((method) => (
            <span
              className={`method-pill ${httpVerbClass(method.kind)}`}
              key={method.id}
            >
              {method.kind}
              {method.output.returnsArray ? "[]" : ""}
            </span>
          ))}
        </div>
      ) : (
        <p className="block-node__empty">No methods.</p>
      )}
      {data.schema.length > 0 ? (
        <ul>
          {data.schema.slice(0, 6).map((field) => (
            <li
              className="block-node__row"
              key={`${field.id}-${field.sourceTableId}-${field.sourceColumnId}`}
            >
              <strong>{field.name || "—"}</strong>
              <span className="type-chip">
                {field.type}
                {field.nullable ? "?" : ""}
              </span>
            </li>
          ))}
          {data.schema.length > 6 ? (
            <li className="block-node__empty">
              +{data.schema.length - 6} more
            </li>
          ) : null}
        </ul>
      ) : null}
    </article>
    <NodeToolbar isVisible={selected} position={Position.Right} offset={16}>
      <RestResourceEditor nodeId={id} data={data} />
    </NodeToolbar>
  </>
);
