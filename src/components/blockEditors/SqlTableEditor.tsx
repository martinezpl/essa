import { useDiagramContext } from "../../app/diagramContext";
import { postgresTypes } from "../../domain/options";
import type { SqlColumn, SqlTableData } from "../../domain/types";
import { updateColumn } from "./helpers";
import { TrashButton } from "./TrashButton";

type SqlTableEditorProps = {
  nodeId: string;
  data: SqlTableData;
};

export const SqlTableEditor = ({ nodeId, data }: SqlTableEditorProps) => {
  const ctx = useDiagramContext();

  return (
    <div className="block-editor nowheel">
      <div className="block-editor__header">
        <div>
          <span className="block-editor__kind block-editor__kind--sqlTable">
            SQL table
          </span>
        </div>
        <TrashButton
          ariaLabel="Delete table"
          onClick={() => ctx.onDeleteNode(nodeId)}
        />
      </div>

      <label>
        Table name
        <input
          placeholder="users"
          value={data.tableName}
          onChange={(event) =>
            ctx.onUpdateNodeData(nodeId, { tableName: event.target.value })
          }
        />
      </label>

      <div className="field-group">
        <div className="field-group__header">
          <h3>Columns</h3>
          <button
            className="button-subtle"
            type="button"
            onClick={() => ctx.onAddSqlColumn(nodeId)}
          >
            + Add
          </button>
        </div>

        {data.columns.length === 0 ? (
          <p className="block-node__empty">No columns yet.</p>
        ) : null}

        {data.columns.map((column) => (
          <div className="column-editor" key={column.id}>
            <div className="row">
              <input
                placeholder="column"
                value={column.name}
                onChange={(event) =>
                  ctx.onReplaceSqlColumns(
                    nodeId,
                    updateColumn(data.columns, column.id, {
                      name: event.target.value,
                    }),
                  )
                }
              />
              <select
                value={column.type}
                onChange={(event) =>
                  ctx.onReplaceSqlColumns(
                    nodeId,
                    updateColumn(data.columns, column.id, {
                      type: event.target.value as SqlColumn["type"],
                    }),
                  )
                }
              >
                {postgresTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div className="row">
              <label className="checkbox-field">
                <input
                  checked={column.nullable}
                  type="checkbox"
                  onChange={(event) =>
                    ctx.onReplaceSqlColumns(
                      nodeId,
                      updateColumn(data.columns, column.id, {
                        nullable: event.target.checked,
                      }),
                    )
                  }
                />
                nullable
              </label>
              <label className="checkbox-field">
                <input
                  checked={column.primaryKey}
                  type="checkbox"
                  onChange={(event) =>
                    ctx.onReplaceSqlColumns(
                      nodeId,
                      updateColumn(data.columns, column.id, {
                        primaryKey: event.target.checked,
                      }),
                    )
                  }
                />
                primary
              </label>
              <span className="row__shrink">
                <TrashButton
                  ariaLabel="Remove column"
                  onClick={() =>
                    ctx.onReplaceSqlColumns(
                      nodeId,
                      data.columns.filter((item) => item.id !== column.id),
                    )
                  }
                />
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
