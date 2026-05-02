import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import { postgresTypes } from "../../domain/options";
import type {
  EssaNode,
  SqlColumn,
  SqlIndex,
  SqlTableData,
} from "../../domain/types";
import { updateColumn } from "../blockEditors/helpers";
import { RowEditPopover } from "../blockEditors/RowEditPopover";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type SqlTableNodeProps = NodeProps<EssaNode> & {
  data: SqlTableData;
};

type EditingTarget =
  | { kind: "column"; id: string }
  | { kind: "index"; id: string }
  | null;

const updateIndex = (
  indices: SqlIndex[],
  indexId: string,
  patch: Partial<SqlIndex>,
) =>
  indices.map((index) =>
    index.id === indexId ? { ...index, ...patch } : index,
  );

export const SqlTableNode = ({ id, data, selected }: SqlTableNodeProps) => {
  const ctx = useDiagramContext();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const closeEditing = () => setEditing(null);

  return (
    <article
      className={`block-node block-node--table block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
    >
      <BlockHandles kind="sqlTable" />

      <header className="block-node__head">
        <span className="block-node__badge">SQL table</span>
        <span className="block-node__head-spacer" />
        <span className="block-node__head-trash">
          <TrashButton
            ariaLabel="Delete table"
            onClick={() => ctx.onDeleteNode(id)}
          />
        </span>
      </header>

      <input
        aria-label="Table name"
        className={`block-node__title-input nodrag${
          data.tableName ? "" : " block-node__title-input--placeholder"
        }`}
        placeholder="table_name"
        value={data.tableName}
        onChange={(event) =>
          ctx.onUpdateNodeData(id, { tableName: event.target.value })
        }
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Columns</h4>

        {data.columns.map((column) => {
          const isEditing =
            editing?.kind === "column" && editing.id === column.id;

          return (
            <div
              key={column.id}
              className={`field-row nodrag${isEditing ? " field-row--active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditing({ kind: "column", id: column.id })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditing({ kind: "column", id: column.id });
                }
              }}
            >
              <span className="field-row__name">{column.name || "—"}</span>
              <span className="field-row__type">{column.type}</span>
              <span className="field-row__flags">
                {column.primaryKey ? <span className="flag-chip">PK</span> : null}
                {column.nullable ? (
                  <span className="flag-chip flag-chip--null">?</span>
                ) : null}
              </span>

              {isEditing ? (
                <RowEditPopover onClose={closeEditing}>
                  <ColumnPopover
                    column={column}
                    onChange={(patch) =>
                      ctx.onReplaceSqlColumns(
                        id,
                        updateColumn(data.columns, column.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplaceSqlColumns(
                        id,
                        data.columns.filter((item) => item.id !== column.id),
                      );
                      closeEditing();
                    }}
                    onClose={closeEditing}
                  />
                </RowEditPopover>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          className="field-row field-row--button nodrag"
          onClick={() => ctx.onAddSqlColumn(id)}
        >
          + Add column
        </button>
      </section>

      <section className="block-node__section">
        <h4 className="block-node__section-title">Indices</h4>

        {data.indices.length === 0 ? (
          <p className="block-node__empty">No indices yet.</p>
        ) : null}

        {data.indices.map((index) => {
          const isEditing = editing?.kind === "index" && editing.id === index.id;

          return (
            <div
              key={index.id}
              className={`field-row nodrag${isEditing ? " field-row--active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditing({ kind: "index", id: index.id })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditing({ kind: "index", id: index.id });
                }
              }}
            >
              <span className="field-row__name">{index.name || "—"}</span>
              <span className="field-row__type">
                {index.columns.length > 0
                  ? index.columns
                      .map(
                        (columnId) =>
                          data.columns.find((item) => item.id === columnId)
                            ?.name || columnId,
                      )
                      .join(", ")
                  : "no columns"}
              </span>
              <span className="field-row__flags">
                {index.unique ? (
                  <span className="flag-chip">UNIQUE</span>
                ) : null}
              </span>

              {isEditing ? (
                <RowEditPopover onClose={closeEditing}>
                  <IndexPopover
                    index={index}
                    columns={data.columns}
                    onChange={(patch) =>
                      ctx.onReplaceSqlIndices(
                        id,
                        updateIndex(data.indices, index.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplaceSqlIndices(
                        id,
                        data.indices.filter((item) => item.id !== index.id),
                      );
                      closeEditing();
                    }}
                    onClose={closeEditing}
                  />
                </RowEditPopover>
              ) : null}
            </div>
          );
        })}

        <button
          type="button"
          className="field-row field-row--button nodrag"
          onClick={() => ctx.onAddSqlIndex(id)}
        >
          + Add index
        </button>
      </section>
    </article>
  );
};

type ColumnPopoverProps = {
  column: SqlColumn;
  onChange: (patch: Partial<SqlColumn>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const ColumnPopover = ({ column, onChange, onDelete, onClose }: ColumnPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Column</span>
      <TrashButton ariaLabel="Remove column" onClick={onDelete} />
    </div>

    <label>
      Name
      <input
        autoFocus
        placeholder="column_name"
        value={column.name}
        onChange={(event) => onChange({ name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onClose();
          }
        }}
      />
    </label>

    <label>
      Type
      <select
        value={column.type}
        onChange={(event) =>
          onChange({ type: event.target.value as SqlColumn["type"] })
        }
      >
        {postgresTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>

    <div className="row">
      <label className="checkbox-field">
        <input
          checked={column.nullable}
          type="checkbox"
          onChange={(event) => onChange({ nullable: event.target.checked })}
        />
        nullable
      </label>
      <label className="checkbox-field">
        <input
          checked={column.primaryKey}
          type="checkbox"
          onChange={(event) => onChange({ primaryKey: event.target.checked })}
        />
        primary
      </label>
    </div>

    <label>
      Description
      <textarea
        rows={2}
        placeholder="Optional"
        value={column.description ?? ""}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </label>
  </div>
);

type IndexPopoverProps = {
  index: SqlIndex;
  columns: SqlColumn[];
  onChange: (patch: Partial<SqlIndex>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const IndexPopover = ({
  index,
  columns,
  onChange,
  onDelete,
  onClose,
}: IndexPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Index</span>
      <TrashButton ariaLabel="Remove index" onClick={onDelete} />
    </div>

    <label>
      Name
      <input
        autoFocus
        placeholder="idx_name"
        value={index.name}
        onChange={(event) => onChange({ name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onClose();
          }
        }}
      />
    </label>

    <div>
      <span className="eyebrow">Columns</span>
      <div className="chip-picker">
        {columns.length === 0 ? (
          <span className="block-node__empty">Add columns first.</span>
        ) : (
          columns.map((column) => {
            const checked = index.columns.includes(column.id);
            return (
              <label
                key={column.id}
                className={`chip${checked ? " chip--active" : ""}`}
              >
                <input
                  hidden
                  type="checkbox"
                  checked={checked}
                  onChange={(event) =>
                    onChange({
                      columns: event.target.checked
                        ? [...index.columns, column.id]
                        : index.columns.filter((item) => item !== column.id),
                    })
                  }
                />
                {column.name || column.id}
              </label>
            );
          })
        )}
      </div>
    </div>

    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={index.unique}
        onChange={(event) => onChange({ unique: event.target.checked })}
      />
      unique
    </label>
  </div>
);
