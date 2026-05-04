import { useCallback, useEffect, useState } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import { psqlColumnTypes, psqlForeignKeyActions, psqlIndexMethods } from "../../domain/options";
import {
  parsePsqlColumnSourceHandleId,
  parsePsqlForeignKeyTargetHandleId,
  psqlColumnSourceHandleId,
  psqlForeignKeyTargetHandleId,
} from "../../domain/psqlForeignKeys";
import { formatPsqlColumnType } from "../../domain/psqlTypes";
import type {
  DiagramNode,
  EssaNode,
  PsqlColumn,
  PsqlColumnType,
  PsqlEnum,
  PsqlForeignKey,
  PsqlForeignKeyAction,
  PsqlIndex,
  PsqlTableData,
} from "../../domain/types";
import { BlockTitleInput } from "../blockEditors/BlockTitleInput";
import { ComboInput } from "../blockEditors/ComboInput";
import { EditableFieldRow } from "../blockEditors/EditableFieldRow";
import { updateColumn } from "../blockEditors/helpers";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type PsqlTableNodeProps = NodeProps<EssaNode> & {
  data: PsqlTableData;
};

type EditingTarget =
  | { kind: "column"; id: string }
  | { kind: "foreignKey"; id: string }
  | { kind: "index"; id: string }
  | { kind: "primaryKey" }
  | null;

type PsqlTableDiagramNode = DiagramNode & {
  data: PsqlTableData;
};

type ForeignKeyTarget = {
  table: PsqlTableDiagramNode;
  column: PsqlColumn;
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

const nameMinWidth = (name: string) =>
  Math.max(440, name.length * 20 + 50);

export const PsqlTableNode = ({ id, data, selected }: PsqlTableNodeProps) => {
  const ctx = useDiagramContext();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [titleLayout, setTitleLayout] = useState(data.tableName);
  const handleTitleDraftChange = useCallback((draft: string) => {
    setTitleLayout(draft);
  }, []);
  const closeEditing = () => setEditing(null);
  const psqlTables = ctx.nodes.filter(
    (node): node is PsqlTableDiagramNode => node.data.kind === "psqlTable",
  );
  const foreignKeyTargets: ForeignKeyTarget[] = psqlTables.flatMap((table) => {
    if (table.id === id) {
      return [];
    }

    const pkColumnIds = new Set(table.data.primaryKey);
    return table.data.columns
      .filter((column) => pkColumnIds.has(column.id))
      .map((column) => ({ table, column }));
  });
  const selectedNodeIds = new Set(
    ctx.nodes.filter((node) => node.selected).map((node) => node.id),
  );
  const linkedForeignKeyIds = new Set<string>();
  const linkedColumnIds = new Set<string>();

  ctx.edges.forEach((edge) => {
    if (!selectedNodeIds.has(edge.source) && !selectedNodeIds.has(edge.target)) {
      return;
    }

    if (edge.source === id) {
      const columnId = parsePsqlColumnSourceHandleId(edge.sourceHandle);

      if (columnId) {
        linkedColumnIds.add(columnId);
      }
    }

    if (edge.target === id) {
      const foreignKeyId = parsePsqlForeignKeyTargetHandleId(edge.targetHandle);

      if (foreignKeyId) {
        linkedForeignKeyIds.add(foreignKeyId);
      }
    }
  });

  return (
    <article
      className={`block-node block-node--table block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
      style={{ minWidth: nameMinWidth(titleLayout) }}
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

      <BlockTitleInput
        nodeId={id}
        committedValue={data.tableName}
        onCommit={(next) => ctx.onUpdateNodeData(id, { tableName: next })}
        onDraftChange={handleTitleDraftChange}
        aria-label="Table name"
        className="block-node__title-input nodrag nowheel"
        emptyClassName="block-node__title-input--placeholder"
        placeholder="table_name"
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Columns</h4>

        {data.columns.map((column) => {
          const isEditing =
            editing?.kind === "column" && editing.id === column.id;
          const isLinked = linkedColumnIds.has(column.id);

          return (
            <EditableFieldRow
              key={column.id}
              isEditing={isEditing}
              isLinked={isLinked}
              onOpen={() => setEditing({ kind: "column", id: column.id })}
              onClose={closeEditing}
              popover={
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
              }
            >
              {data.primaryKey.includes(column.id) ? (
                <Handle
                  className="field-row__handle field-row__handle--source"
                  id={psqlColumnSourceHandleId(column.id)}
                  position={Position.Right}
                  type="source"
                  isConnectable={false}
                />
              ) : null}
              <span className="field-row__name">{column.name || "—"}</span>
              <span className="field-row__type">
                {formatPsqlColumnType(column, ctx.psqlEnums)}
              </span>
              <span className="field-row__flags">
                {data.primaryKey.includes(column.id) ? (
                  <span className="flag-chip">PK</span>
                ) : null}
                {column.unique ? (
                  <span className="flag-chip">UNIQUE</span>
                ) : null}
                {column.defaultValue?.trim() ? (
                  <span className="flag-chip" title={column.defaultValue}>
                    DEFAULT
                  </span>
                ) : null}
                {column.check?.trim() ? (
                  <span className="flag-chip" title={column.check}>
                    CHECK
                  </span>
                ) : null}
                {column.nullable ? (
                  <span className="flag-chip flag-chip--null">?</span>
                ) : null}
              </span>
            </EditableFieldRow>
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
          const isLinked = linkedForeignKeyIds.has(foreignKey.id);
          const reference = formatForeignKeyReference(foreignKey, psqlTables);

          return (
            <EditableFieldRow
              key={foreignKey.id}
              isEditing={isEditing}
              isLinked={isLinked}
              onOpen={() =>
                setEditing({ kind: "foreignKey", id: foreignKey.id })
              }
              onClose={closeEditing}
              popover={
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
              }
            >
              <Handle
                className="field-row__handle field-row__handle--target"
                id={psqlForeignKeyTargetHandleId(foreignKey.id)}
                position={Position.Left}
                type="target"
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
                {data.primaryKey.includes(foreignKey.id) ? (
                  <span className="flag-chip">PK</span>
                ) : null}
                {foreignKey.onDelete !== "NO ACTION" ? (
                  <span className="flag-chip flag-chip--cascade" title={`ON DELETE ${foreignKey.onDelete}`}>↓</span>
                ) : null}
                {foreignKey.onUpdate !== "NO ACTION" ? (
                  <span className="flag-chip flag-chip--cascade" title={`ON UPDATE ${foreignKey.onUpdate}`}>↑</span>
                ) : null}
                {foreignKey.nullable ? (
                  <span className="flag-chip flag-chip--null">?</span>
                ) : null}
              </span>
            </EditableFieldRow>
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
        <h4 className="block-node__section-title">Primary key</h4>

        <EditableFieldRow
          isEditing={editing?.kind === "primaryKey"}
          onOpen={() => setEditing({ kind: "primaryKey" })}
          onClose={closeEditing}
          popover={
            <PrimaryKeyPopover
              primaryKey={data.primaryKey}
              columns={data.columns}
              foreignKeys={data.foreignKeys}
              onChange={(primaryKey) =>
                ctx.onUpdateNodeData(id, { primaryKey })
              }
              onClear={() => {
                ctx.onUpdateNodeData(id, { primaryKey: [] });
                closeEditing();
              }}
            />
          }
        >
          <span className="field-row__name">
            {data.primaryKey.length > 0
              ? data.primaryKey
                  .map(
                    (pkId) =>
                      data.columns.find((c) => c.id === pkId)?.name ||
                      data.foreignKeys.find((fk) => fk.id === pkId)?.name ||
                      pkId,
                  )
                  .join(", ")
              : "—"}
          </span>
          {data.primaryKey.length > 0 ? (
            <span className="field-row__flags">
              <span className="flag-chip">PK</span>
            </span>
          ) : null}
        </EditableFieldRow>
      </section>

      <section className="block-node__section">
        <h4 className="block-node__section-title">Indices</h4>

        {data.indices.length === 0 ? (
          <p className="block-node__empty">No indices yet.</p>
        ) : null}

        {data.indices.map((index) => {
          const isEditing = editing?.kind === "index" && editing.id === index.id;

          return (
            <EditableFieldRow
              key={index.id}
              isEditing={isEditing}
              onOpen={() => setEditing({ kind: "index", id: index.id })}
              onClose={closeEditing}
              popover={
                <IndexPopover
                  index={index}
                  columns={data.columns}
                  foreignKeys={data.foreignKeys}
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
                />
              }
            >
              <span className="field-row__type">
                {index.columns.length > 0
                  ? index.columns
                      .map(
                        (columnId) =>
                          data.columns.find((item) => item.id === columnId)?.name ||
                          data.foreignKeys.find((item) => item.id === columnId)?.name ||
                          columnId,
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
            </EditableFieldRow>
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

    <div className="row-popover__section row-popover__section--constraints">
      <div className="plate-toggle-group" aria-label="Column constraints">
        <button
          type="button"
          className={`plate-toggle${column.nullable ? " plate-toggle--active" : ""}`}
          aria-pressed={column.nullable}
          onClick={() => onChange({ nullable: !column.nullable })}
        >
          nullable
        </button>
        <button
          type="button"
          className={`plate-toggle${column.unique ? " plate-toggle--active" : ""}`}
          aria-pressed={column.unique ?? false}
          onClick={() => onChange({ unique: !(column.unique ?? false) })}
        >
          unique
        </button>
      </div>

      <label>
        Default (SQL expression)
        <input
          placeholder="e.g. gen_random_uuid() or 'draft'"
          value={column.defaultValue ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            onChange({
              defaultValue: next.trim() === "" ? undefined : next,
            });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              onClose();
            }
          }}
        />
      </label>

      <label>
        CHECK (predicate only)
        <textarea
          rows={2}
          placeholder="e.g. length(trim(name)) > 0"
          value={column.check ?? ""}
          onChange={(event) => {
            const next = event.target.value;
            onChange({
              check: next.trim() === "" ? undefined : next,
            });
          }}
        />
      </label>
    </div>

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

const fkActionOptions = psqlForeignKeyActions;

const formatReferenceOption = (table: PsqlTableDiagramNode, column: PsqlColumn) =>
  `${table.data.tableName || "table"}.${column.name || "column"} (${column.type})`;

const ForeignKeyPopover = ({
  foreignKey,
  foreignKeyTargets,
  onChange,
  onDelete,
  onClose,
}: ForeignKeyPopoverProps) => {
  const referenceOptions = foreignKeyTargets.map(({ table, column }) =>
    formatReferenceOption(table, column),
  );

  const currentReference =
    foreignKey.targetTableId && foreignKey.targetColumnId
      ? (foreignKeyTargets.find(
          ({ table, column }) =>
            table.id === foreignKey.targetTableId &&
            column.id === foreignKey.targetColumnId,
        ) ?? null)
      : null;

  const currentReferenceDisplay = currentReference
    ? formatReferenceOption(currentReference.table, currentReference.column)
    : "";

  return (
    <div className="row-popover__inner">
      <div className="row-popover__header">
        <span className="eyebrow">Foreign key</span>
        <TrashButton ariaLabel="Remove foreign key" onClick={onDelete} />
      </div>

      <label>
        References
        <ComboInput
          ariaLabel="References"
          options={referenceOptions}
          value={currentReferenceDisplay}
          placeholder="Select primary key"
          onChange={(display) => {
            const target = foreignKeyTargets.find(
              ({ table, column }) =>
                formatReferenceOption(table, column) === display,
            );
            if (target) {
              onChange({
                targetTableId: target.table.id,
                targetColumnId: target.column.id,
                type: target.column.type as PsqlColumnType,
              });
            }
          }}
        />
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

      <div className="row">
        <label>
          On Delete
          <ComboInput
            ariaLabel="On Delete"
            options={fkActionOptions}
            value={foreignKey.onDelete}
            onChange={(value) =>
              onChange({ onDelete: value as PsqlForeignKeyAction })
            }
          />
        </label>
        <label>
          On Update
          <ComboInput
            ariaLabel="On Update"
            options={fkActionOptions}
            value={foreignKey.onUpdate}
            onChange={(value) =>
              onChange({ onUpdate: value as PsqlForeignKeyAction })
            }
          />
        </label>
      </div>
    </div>
  );
};

type IndexPopoverProps = {
  index: PsqlIndex;
  columns: PsqlColumn[];
  foreignKeys: PsqlForeignKey[];
  onChange: (patch: Partial<PsqlIndex>) => void;
  onDelete: () => void;
};

const IndexPopover = ({
  index,
  columns,
  foreignKeys,
  onChange,
  onDelete,
}: IndexPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Index</span>
      <TrashButton ariaLabel="Remove index" onClick={onDelete} />
    </div>

    <label>
      Method
      <ComboInput
        ariaLabel="Index method"
        options={psqlIndexMethods}
        value={index.method}
        onChange={(next) =>
          onChange({ method: next as PsqlIndex["method"] })
        }
      />
    </label>

    <div>
      <span className="eyebrow">Columns</span>
      <div className="chip-picker">
        {columns.length === 0 && foreignKeys.length === 0 ? (
          <span className="block-node__empty">Add columns first.</span>
        ) : null}
        {columns.map((column) => {
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
        })}
        {foreignKeys.map((foreignKey) => {
          const checked = index.columns.includes(foreignKey.id);
          return (
            <label
              key={foreignKey.id}
              className={`chip${checked ? " chip--active" : ""}`}
            >
              <input
                hidden
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange({
                    columns: event.target.checked
                      ? [...index.columns, foreignKey.id]
                      : index.columns.filter((item) => item !== foreignKey.id),
                  })
                }
              />
              {foreignKey.name || foreignKey.id}
              <span className="chip__badge">FK</span>
            </label>
          );
        })}
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

type PrimaryKeyPopoverProps = {
  primaryKey: string[];
  columns: PsqlColumn[];
  foreignKeys: PsqlForeignKey[];
  onChange: (primaryKey: string[]) => void;
  onClear: () => void;
};

const PrimaryKeyPopover = ({
  primaryKey,
  columns,
  foreignKeys,
  onChange,
  onClear,
}: PrimaryKeyPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Primary key</span>
      <TrashButton ariaLabel="Clear primary key" onClick={onClear} />
    </div>

    <div>
      <span className="eyebrow">Columns</span>
      <div className="chip-picker">
        {columns.length === 0 && foreignKeys.length === 0 ? (
          <span className="block-node__empty">Add columns first.</span>
        ) : null}
        {columns.map((column) => {
          const checked = primaryKey.includes(column.id);
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
                  onChange(
                    event.target.checked
                      ? [...primaryKey, column.id]
                      : primaryKey.filter((id) => id !== column.id),
                  )
                }
              />
              {column.name || column.id}
            </label>
          );
        })}
        {foreignKeys.map((foreignKey) => {
          const checked = primaryKey.includes(foreignKey.id);
          return (
            <label
              key={foreignKey.id}
              className={`chip${checked ? " chip--active" : ""}`}
            >
              <input
                hidden
                type="checkbox"
                checked={checked}
                onChange={(event) =>
                  onChange(
                    event.target.checked
                      ? [...primaryKey, foreignKey.id]
                      : primaryKey.filter((id) => id !== foreignKey.id),
                  )
                }
              />
              {foreignKey.name || foreignKey.id}
              <span className="chip__badge">FK</span>
            </label>
          );
        })}
      </div>
    </div>
  </div>
);
