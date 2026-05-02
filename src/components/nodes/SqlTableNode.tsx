import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { EssaNode, SqlTableData } from "../../domain/types";

type SqlTableNodeProps = NodeProps<EssaNode> & {
  data: SqlTableData;
};

export const SqlTableNode = ({ data }: SqlTableNodeProps) => (
  <article className="block-node block-node--table">
    <Handle type="target" position={Position.Left} />
    <span className="block-node__type">SQL Table</span>
    <h3>{data.tableName || "No table set"}</h3>
    <ul>
      {data.columns.map((column) => (
        <li key={column.id}>
          <strong>{column.name}</strong>
          <span>
            {column.type}
            {column.primaryKey ? " PK" : ""}
          </span>
        </li>
      ))}
    </ul>
  </article>
);
