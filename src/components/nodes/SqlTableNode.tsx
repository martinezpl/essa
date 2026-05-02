import { NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import type { EssaNode, SqlTableData } from "../../domain/types";
import { SqlTableEditor } from "../blockEditors/SqlTableEditor";
import { BlockHandles } from "./BlockHandles";

type SqlTableNodeProps = NodeProps<EssaNode> & {
  data: SqlTableData;
};

export const SqlTableNode = ({ id, data, selected }: SqlTableNodeProps) => (
  <>
    <article className="block-node block-node--table">
      <BlockHandles kind="sqlTable" />
      <header className="block-node__head">
        <span className="block-node__badge">SQL table</span>
      </header>
      <h3
        className={`block-node__title${
          data.tableName ? "" : " block-node__title--placeholder"
        }`}
      >
        {data.tableName || "no table"}
      </h3>
      {data.columns.length > 0 ? (
        <ul>
          {data.columns.slice(0, 8).map((column) => (
            <li className="block-node__column" key={column.id}>
              <span className="block-node__column-name">
                {column.name || "—"}
              </span>
              <span className="block-node__column-type">{column.type}</span>
              <span className="block-node__column-flags">
                {column.primaryKey ? <span className="flag-chip">PK</span> : null}
                {column.nullable ? (
                  <span className="flag-chip flag-chip--null">?</span>
                ) : null}
              </span>
            </li>
          ))}
          {data.columns.length > 8 ? (
            <li className="block-node__empty">
              +{data.columns.length - 8} more
            </li>
          ) : null}
        </ul>
      ) : (
        <p className="block-node__empty">No columns yet.</p>
      )}
    </article>
    <NodeToolbar isVisible={selected} position={Position.Right} offset={16}>
      <SqlTableEditor nodeId={id} data={data} />
    </NodeToolbar>
  </>
);
