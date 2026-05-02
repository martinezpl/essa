import { useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import { psqlColumnTypes, psqlIndexMethods } from "../../domain/options";
import {
  psqlColumnTargetHandleId,
  psqlForeignKeySourceHandleId,
} from "../../domain/psqlForeignKeys";
import { formatPsqlColumnType } from "../../domain/psqlTypes";
import type {
  DiagramNode,
  EssaNode,
  PsqlColumn,
  PsqlColumnType,
  PsqlEnum,
  PsqlForeignKey,
  PsqlIndex,
  PsqlTableData,
} from "../../domain/types";
import { ComboInput } from "../blockEditors/ComboInput";
import { updateColumn } from "../blockEditors/helpers";
import { RowEditPopover } from "../blockEditors/RowEditPopover";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type PsqlTableNodeProps = NodeProps<EssaNode> & {
  data: PsqlTableData;
};

type EditingTarget =
  | { kind: "column"; id: string }
  | { kind: "foreignKey"; id: string }
  | { kind: "index"; id: string }
  | null;

type PsqlTableDiagramNode = DiagramNode & {
  data: PsqlTableData;
};

type ForeignKeyTarget = {
  table: PsqlTableDiagramNode;
  primaryKey: PsqlColumn;
};

const updateIndex = (
  indices: PsqlIndex[],
  indexId: string,
  patch: Partial<PsqlIndex>,
) =>
  indices.map((index) =>
    index.id === indexId ? { ...index, ...patch } : index,
  );

const updateForeignKey = (
  foreignKeys: PsqlForeignKey[],
  foreignKeyId: string,
  patch: Partial<PsqlForeignKey>,
) =>
  foreignKeys.map((foreignKey) =>
    foreignKey.id === foreignKeyId ? { ...foreignKey, ...patch } : foreignKey,
  );

const formatForeignKeyReference = (
  foreignKey: PsqlForeignKey,
  tables: PsqlTableDiagramNode[],
) => {
  const targetTable = tables.find(
    (table) => table.id === foreignKey.targetTableId,
  );
  const targetColumn = targetTable?.data.columns.find(
    (item) => item.id === foreignKey.targetColumnId,
  );

  if (!targetTable || !targetColumn) {
    return null;
  }

  return `${targetTable.data.tableName || "table"}.${targetColumn.name || "column"}`;
};

export const PsqlTableNode = ({ id, data, selected }: PsqlTableNodeProps) => {
  const ctx = useDiagramContext();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const closeEditing = () => setEditing(null);
  const psqlTables = ctx.nodes.filter(
    (node): node is PsqlTableDiagramNode => node.data.kind === "psqlTable",
  );
  const foreignKeyTargets: ForeignKeyTarget[] = psqlTables.flatMap((table) => {
    if (table.id === id) {
      return [];
    }

    return table.data.columns
      .filter((column) => column.primaryKey)
      .map((primaryKey) => ({ table, primaryKey }));
  });

  return (
    <article
      className={`block-node block-node--table block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
    >
      <BlockHandles kind="psqlTable" />

      <header className="block-node__head">
        <span className="block-node__badge">PSQL table</span>
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
              {column.primaryKey ? (
                <Handle
                  className="field-row__handle field-row__handle--target"
                  id={psqlColumnTargetHandleId(column.id)}
                  position={Position.Left}
                  type="target"
                  isConnectable={false}
                />
              ) : null}
              <span className="field-row__name">{column.name || "—"}</span>
              <span className="field-row__type">
                {formatPsqlColumnType(column, ctx.psqlEnums)}
              </span>
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
                    psqlEnums={ctx.psqlEnums}
                    onAddPsqlEnum={ctx.onAddPsqlEnum}
                    onReplacePsqlEnums={ctx.onReplacePsqlEnums}
                    onChange={(patch) =>
                      ctx.onReplacePsqlColumns(
                        id,
                        updateColumn(data.columns, column.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplacePsqlColumns(
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
          onClick={() => {
            const newId = ctx.onAddPsqlColumn(id);
            if (newId) {
              setEditing({ kind: "column", id: newId });
            }
          }}
        >
          + Add column
        </button>
      </section>

      <section className="block-node__section">
        <h4 className="block-node__section-title">Foreign keys</h4>

        {data.foreignKeys.length === 0 ? (
          <p className="block-node__empty">No foreign keys yet.</p>
        ) : null}

        {data.foreignKeys.map((foreignKey) => {
          const isEditing =
            editing?.kind === "foreignKey" && editing.id === foreignKey.id;
          const reference = formatForeignKeyReference(foreignKey, psqlTables);

          return (
            <div
              key={foreignKey.id}
              className={`field-row nodrag${isEditing ? " field-row--active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() =>
                setEditing({ kind: "foreignKey", id: foreignKey.id })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditing({ kind: "foreignKey", id: foreignKey.id });
                }
              }}
            >
              <Handle
                className="field-row__handle field-row__handle--source"
                id={psqlForeignKeySourceHandleId(foreignKey.id)}
                position={Position.Right}
                type="source"
                isConnectable={false}
              />
              <span className="field-row__name">
                {foreignKey.name || "—"}
              </span>
              <span className="field-row__type">
                {reference ? `→ ${reference}` : "no reference"}
                {foreignKey.type ? ` · ${foreignKey.type}` : ""}
              </span>
              <span className="field-row__flags">
                <span className="flag-chip flag-chip--fk">FK</span>
                {foreignKey.nullable ? (
                  <span className="flag-chip flag-chip--null">?</span>
                ) : null}
              </span>

              {isEditing ? (
                <RowEditPopover onClose={closeEditing}>
                  <ForeignKeyPopover
                    foreignKey={foreignKey}
                    foreignKeyTargets={foreignKeyTargets}
                    onChange={(patch) =>
                      ctx.onReplacePsqlForeignKeys(
                        id,
                        updateForeignKey(data.foreignKeys, foreignKey.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplacePsqlForeignKeys(
                        id,
                        data.foreignKeys.filter(
                          (item) => item.id !== foreignKey.id,
                        ),
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
          onClick={() => {
            const newId = ctx.onAddPsqlForeignKey(id);
            if (newId) {
              setEditing({ kind: "foreignKey", id: newId });
            }
          }}
        >
          + Add foreign key
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
                <span className="flag-chip flag-chip--null">
                  {index.method}
                </span>
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
                      ctx.onReplacePsqlIndices(
                        id,
                        updateIndex(data.indices, index.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplacePsqlIndices(
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
          onClick={() => {
            const newId = ctx.onAddPsqlIndex(id);
            if (newId) {
              setEditing({ kind: "index", id: newId });
            }
          }}
        >
          + Add index
        </button>
      </section>
    </article>
  );
};

type ColumnPopoverProps = {
  column: PsqlColumn;
  psqlEnums: PsqlEnum[];
  onAddPsqlEnum: () => string;
  onReplacePsqlEnums: (enums: PsqlEnum[]) => void;
  onChange: (patch: Partial<PsqlColumn>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const lengthOptionTypes = new Set<PsqlColumnType>([
  "varchar",
  "char",
  "bit",
  "varbit",
]);

const numericOptionTypes = new Set<PsqlColumnType>(["numeric", "decimal"]);

const precisionOptionTypes = new Set<PsqlColumnType>([
  "time",
  "timetz",
  "timestamp",
  "timestamptz",
  "interval",
]);

const arrayOptionTypes = new Set<PsqlColumnType>(
  psqlColumnTypes.filter((type) => type.endsWith("[]")),
);

const arrayItemTypeOptions = psqlColumnTypes.filter(
  (type) => !type.endsWith("[]") && type !== "enum",
);

const toOptionalInteger = (value: string) => {
  if (value === "") {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const updateEnum = (
  psqlEnums: PsqlEnum[],
  enumId: string,
  patch: Partial<PsqlEnum>,
) =>
  psqlEnums.map((psqlEnum) =>
    psqlEnum.id === enumId ? { ...psqlEnum, ...patch } : psqlEnum,
  );

const parseEnumValuesDraft = (draft: string) =>
  draft
    .split(/[,\n]/)
    .map((value) => value.trim())
    .filter(Boolean);

const ColumnPopover = ({
  column,
  psqlEnums,
  onAddPsqlEnum,
  onReplacePsqlEnums,
  onChange,
  onDelete,
  onClose,
}: ColumnPopoverProps) => {
  const selectedEnum = psqlEnums.find((item) => item.id === column.options?.enumId);
  const optionValues = column.options ?? {};
  const [enumValuesDraft, setEnumValuesDraft] = useState(
    () => selectedEnum?.values.join(", ") ?? "",
  );

  useEffect(() => {
    setEnumValuesDraft(selectedEnum?.values.join(", ") ?? "");
  }, [selectedEnum?.id]);

  const handleCreateEnum = () => {
    const enumId = onAddPsqlEnum();
    onChange({ type: "enum", options: { ...optionValues, enumId } });
  };

  return (
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
      <ComboInput
        ariaLabel="Column type"
        options={psqlColumnTypes}
        value={column.type}
        onChange={(next) =>
          onChange({ type: next as PsqlColumn["type"], options: undefined })
        }
      />
    </label>

    {lengthOptionTypes.has(column.type) ? (
      <label>
        Length
        <input
          min={1}
          type="number"
          value={optionValues.length ?? ""}
          onChange={(event) =>
            onChange({
              options: {
                ...optionValues,
                length: toOptionalInteger(event.target.value),
              },
            })
          }
        />
      </label>
    ) : null}

    {numericOptionTypes.has(column.type) ? (
      <div className="row">
        <label>
          Precision
          <input
            min={0}
            type="number"
            value={optionValues.precision ?? ""}
            onChange={(event) =>
              onChange({
                options: {
                  ...optionValues,
                  precision: toOptionalInteger(event.target.value),
                },
              })
            }
          />
        </label>
        <label>
          Scale
          <input
            min={0}
            type="number"
            value={optionValues.scale ?? ""}
            onChange={(event) =>
              onChange({
                options: {
                  ...optionValues,
                  scale: toOptionalInteger(event.target.value),
                },
              })
            }
          />
        </label>
      </div>
    ) : null}

    {precisionOptionTypes.has(column.type) ? (
      <label>
        Precision
        <input
          min={0}
          type="number"
          value={optionValues.precision ?? ""}
          onChange={(event) =>
            onChange({
              options: {
                ...optionValues,
                precision: toOptionalInteger(event.target.value),
              },
            })
          }
        />
      </label>
    ) : null}

    {column.type === "enum" ? (
      <>
        <label>
          Enum type
          <select
            value={column.options?.enumId ?? ""}
            onChange={(event) =>
              onChange({
                options: { ...optionValues, enumId: event.target.value },
              })
            }
          >
            <option value="">Select enum</option>
            {psqlEnums.map((psqlEnum) => (
              <option key={psqlEnum.id} value={psqlEnum.id}>
                {psqlEnum.name || "unnamed_enum"}
              </option>
            ))}
          </select>
        </label>

        <button type="button" onClick={handleCreateEnum}>
          + Create enum
        </button>

        {selectedEnum ? (
          <>
            <label>
              Enum name
              <input
                placeholder="status_enum"
                value={selectedEnum.name}
                onChange={(event) =>
                  onReplacePsqlEnums(
                    updateEnum(psqlEnums, selectedEnum.id, {
                      name: event.target.value,
                    }),
                  )
                }
              />
            </label>
            <label>
              Enum values
              <textarea
                rows={3}
                placeholder="draft, published, archived"
                value={enumValuesDraft}
                onChange={(event) => {
                  const nextDraft = event.target.value;
                  setEnumValuesDraft(nextDraft);
                  onReplacePsqlEnums(
                    updateEnum(psqlEnums, selectedEnum.id, {
                      values: parseEnumValuesDraft(nextDraft),
                    }),
                  );
                }}
              />
            </label>
          </>
        ) : null}
      </>
    ) : null}

    {arrayOptionTypes.has(column.type) ? (
      <label>
        Array item type
        <ComboInput
          ariaLabel="Array item type"
          options={arrayItemTypeOptions}
          value={optionValues.arrayItemType ?? column.type.replace("[]", "")}
          onChange={(next) =>
            onChange({
              options: {
                ...optionValues,
                arrayItemType: next as PsqlColumnType,
              },
            })
          }
        />
      </label>
    ) : null}

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
};

type ForeignKeyPopoverProps = {
  foreignKey: PsqlForeignKey;
  foreignKeyTargets: ForeignKeyTarget[];
  onChange: (patch: Partial<PsqlForeignKey>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const targetValue = (tableId: string, columnId: string) =>
  `${tableId}:${columnId}`;

const ForeignKeyPopover = ({
  foreignKey,
  foreignKeyTargets,
  onChange,
  onDelete,
  onClose,
}: ForeignKeyPopoverProps) => {
  const currentTargetValue =
    foreignKey.targetTableId && foreignKey.targetColumnId
      ? targetValue(foreignKey.targetTableId, foreignKey.targetColumnId)
      : "";

  return (
    <div className="row-popover__inner">
      <div className="row-popover__header">
        <span className="eyebrow">Foreign key</span>
        <TrashButton ariaLabel="Remove foreign key" onClick={onDelete} />
      </div>

      <label>
        References
        <select
          autoFocus
          value={currentTargetValue}
          onChange={(event) => {
            const [targetTableId = "", targetColumnId = ""] =
              event.target.value.split(":");
            const target = foreignKeyTargets.find(
              ({ table, primaryKey }) =>
                table.id === targetTableId && primaryKey.id === targetColumnId,
            );

            onChange({
              targetTableId,
              targetColumnId,
              type: (target?.primaryKey.type as PsqlColumnType | undefined) ??
                foreignKey.type,
            });
          }}
        >
          <option value="">Select primary key</option>
          {foreignKeyTargets.map(({ table, primaryKey }) => (
            <option
              key={`${table.id}-${primaryKey.id}`}
              value={targetValue(table.id, primaryKey.id)}
            >
              {(table.data.tableName || "table")}.
              {primaryKey.name || "column"} ({primaryKey.type})
            </option>
          ))}
        </select>
      </label>

      {foreignKeyTargets.length === 0 ? (
        <p className="block-node__empty">
          Add a primary key to another PSQL table to reference it.
        </p>
      ) : null}

      <label>
        Name
        <input
          placeholder="user_id"
          value={foreignKey.name}
          onChange={(event) => onChange({ name: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onClose();
            }
          }}
        />
      </label>

      <div className="row">
        <label>
          Type
          <input readOnly value={foreignKey.type} aria-label="Foreign key type" />
        </label>
        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={foreignKey.nullable}
            onChange={(event) => onChange({ nullable: event.target.checked })}
          />
          nullable
        </label>
      </div>
    </div>
  );
};

type IndexPopoverProps = {
  index: PsqlIndex;
  columns: PsqlColumn[];
  onChange: (patch: Partial<PsqlIndex>) => void;
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

    <label>
      Method
      <select
        value={index.method}
        onChange={(event) =>
          onChange({ method: event.target.value as PsqlIndex["method"] })
        }
      >
        {psqlIndexMethods.map((method) => (
          <option key={method} value={method}>
            {method}
          </option>
        ))}
      </select>
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
