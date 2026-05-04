import { useCallback, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import {
  jsonFieldTypes,
  restMethodInputModes,
  restMethods,
} from "../../domain/options";
import type {
  EssaNode,
  PsqlEnum,
  ResourceSchemaField,
  RestMethodInputField,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
} from "../../domain/types";
import { BlockTitleInput } from "../blockEditors/BlockTitleInput";
import { httpVerbClass, updateSchemaField } from "../blockEditors/helpers";
import { RowEditPopover } from "../blockEditors/RowEditPopover";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type RestResourceNodeProps = NodeProps<EssaNode> & {
  data: RestResourceData;
};

type EditingTarget =
  | { kind: "schema"; id: string }
  | { kind: "input"; methodId: string; inputId: string }
  | null;

const updateInputField = (
  inputs: RestMethodInputField[],
  inputId: string,
  patch: Partial<RestMethodInputField>,
) =>
  inputs.map((input) =>
    input.id === inputId
      ? ({
          ...input,
          ...patch,
          type: patch.mode === "query" ? "string" : (patch.type ?? input.type),
        } as RestMethodInputField)
      : input,
  );

const formatResourceFieldType = (
  field: ResourceSchemaField,
  psqlEnums: PsqlEnum[],
) => {
  const enumName = field.enum
    ? psqlEnums.find(
        (item) =>
          item.values.length === field.enum?.length &&
          item.values.every((value, index) => value === field.enum?.[index]),
      )?.name
    : undefined;

  return enumName || field.type;
};

const getSelectedEnumId = (
  field: ResourceSchemaField,
  psqlEnums: PsqlEnum[],
) =>
  field.enum
    ? (psqlEnums.find(
        (item) =>
          item.values.length === field.enum?.length &&
          item.values.every((value, index) => value === field.enum?.[index]),
      )?.id ?? "")
    : "";

const nameMinWidth = (name: string) =>
  Math.max(440, name.length * 20 + 50);

export const RestResourceNode = ({
  id,
  data,
  selected,
}: RestResourceNodeProps) => {
  const ctx = useDiagramContext();
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [expandedMethodId, setExpandedMethodId] = useState<string | null>(null);
  const [titleLayout, setTitleLayout] = useState(data.resourceName);
  const handleTitleDraftChange = useCallback((draft: string) => {
    setTitleLayout(draft);
  }, []);
  const closeEditing = () => setEditing(null);

  const remainingMethodKinds = restMethods.filter(
    (method) => !data.methods.some((item) => item.kind === method),
  );

  return (
    <article
      className={`block-node block-node--resource block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
      style={{ minWidth: nameMinWidth(titleLayout) }}
    >
      <BlockHandles kind="restResource" />

      <header className="block-node__head">
        <span className="block-node__badge">Resource</span>
        <span className="block-node__head-spacer" />
        <span className="block-node__head-trash">
          <TrashButton
            ariaLabel="Delete resource"
            onClick={() => ctx.onDeleteNode(id)}
          />
        </span>
      </header>

      <BlockTitleInput
        nodeId={id}
        committedValue={data.resourceName}
        onCommit={(next) => ctx.onUpdateNodeData(id, { resourceName: next })}
        onDraftChange={handleTitleDraftChange}
        aria-label="Resource name"
        className="block-node__title-input nodrag nowheel"
        emptyClassName="block-node__title-input--placeholder"
        placeholder="resource"
      />

      <textarea
        aria-label="Resource description"
        className="block-node__description-input nodrag nowheel"
        placeholder="Context"
        rows={2}
        value={data.description ?? ""}
        onChange={(event) =>
          ctx.onUpdateNodeData(id, { description: event.target.value })
        }
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Schema</h4>

        {data.schema.length === 0 ? (
          <p className="block-node__empty">
            Connect to a PSQL table or add fields manually.
          </p>
        ) : null}

        {data.schema.map((field) => {
          const isEditing =
            editing?.kind === "schema" && editing.id === field.id;

          return (
            <div
              key={`${field.id}-${field.sourceTableId}-${field.sourceColumnId}`}
              className={`field-row nodrag${isEditing ? " field-row--active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditing({ kind: "schema", id: field.id })}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditing({ kind: "schema", id: field.id });
                }
              }}
            >
              <span className="field-row__name">{field.name || "—"}</span>
              <span className="field-row__type">
                {formatResourceFieldType(field, ctx.psqlEnums)}
                {field.nullable ? "?" : ""}
              </span>

              {isEditing ? (
                <RowEditPopover onClose={closeEditing}>
                  <SchemaFieldPopover
                    field={field}
                    psqlEnums={ctx.psqlEnums}
                    onChange={(patch) =>
                      ctx.onReplaceResourceSchema(
                        id,
                        updateSchemaField(data.schema, field.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplaceResourceSchema(
                        id,
                        data.schema.filter((item) => item.id !== field.id),
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
            const newId = ctx.onAddResourceSchemaField(id, data.schema);
            if (newId) {
              setEditing({ kind: "schema", id: newId });
            }
          }}
        >
          + Add field
        </button>
      </section>

      <section className="block-node__section">
        <h4 className="block-node__section-title">Methods</h4>

        {data.methods.map((method) => {
          const expanded = expandedMethodId === method.id;

          return (
            <div
              key={method.id}
              className={`method-row nodrag${expanded ? " method-row--expanded" : ""}`}
            >
              <div
                className="method-row__head"
                role="button"
                tabIndex={0}
                onClick={() => setExpandedMethodId(expanded ? null : method.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setExpandedMethodId(expanded ? null : method.id);
                  }
                }}
              >
                <span className={`method-pill ${httpVerbClass(method.kind)}`}>
                  {method.kind}
                  {method.output.returnsArray ? "[]" : ""}
                </span>
                <span className="method-row__hint">
                  {method.input.length > 0
                    ? `${method.input.length} input${method.input.length === 1 ? "" : "s"}`
                    : "no inputs"}
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${method.kind}`}
                  className="button-icon button-icon--sm button-icon--danger"
                  onClick={(event) => {
                    event.stopPropagation();
                    ctx.onRemoveRestMethod(id, method.id);
                    if (expandedMethodId === method.id) {
                      setExpandedMethodId(null);
                    }
                  }}
                >
                  ×
                </button>
              </div>

              {expanded ? (
                <MethodPanel
                  method={method}
                  onChange={(updater) =>
                    ctx.onUpdateRestMethod(id, method.id, updater)
                  }
                  onAddInput={() => {
                    const newInputId = ctx.onAddRestMethodInput(id, method.id);
                    if (newInputId) {
                      setEditing({
                        kind: "input",
                        methodId: method.id,
                        inputId: newInputId,
                      });
                    }
                  }}
                  editingInputId={
                    editing?.kind === "input" && editing.methodId === method.id
                      ? editing.inputId
                      : null
                  }
                  setEditingInput={(inputId) => {
                    setEditing(
                      inputId
                        ? {
                            kind: "input",
                            methodId: method.id,
                            inputId,
                          }
                        : null,
                    );
                  }}
                  onUpdateInput={(inputId, patch) =>
                    ctx.onReplaceRestMethodInputs(
                      id,
                      method.id,
                      updateInputField(method.input, inputId, patch),
                    )
                  }
                  onDeleteInput={(inputId) => {
                    ctx.onReplaceRestMethodInputs(
                      id,
                      method.id,
                      method.input.filter((item) => item.id !== inputId),
                    );
                    if (
                      editing?.kind === "input" &&
                      editing.inputId === inputId
                    ) {
                      closeEditing();
                    }
                  }}
                />
              ) : null}
            </div>
          );
        })}

        {remainingMethodKinds.length > 0 ? (
          <AddMethodRow
            options={remainingMethodKinds}
            onAdd={(kind) => ctx.onAddRestMethod(id, kind)}
          />
        ) : null}
      </section>
    </article>
  );
};

type SchemaFieldPopoverProps = {
  field: ResourceSchemaField;
  psqlEnums: PsqlEnum[];
  onChange: (patch: Partial<ResourceSchemaField>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const SchemaFieldPopover = ({
  field,
  psqlEnums,
  onChange,
  onDelete,
  onClose,
}: SchemaFieldPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Schema field</span>
      <TrashButton ariaLabel="Remove field" onClick={onDelete} />
    </div>

    <label>
      Name
      <input
        autoFocus
        placeholder="field"
        value={field.name}
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
        value={field.type}
        onChange={(event) =>
          onChange({
            type: event.target.value as ResourceSchemaField["type"],
            enum: undefined,
          })
        }
      >
        {jsonFieldTypes.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
    </label>

    {psqlEnums.length > 0 ? (
      <label>
        Enum
        <select
          value={getSelectedEnumId(field, psqlEnums)}
          onChange={(event) =>
            onChange({
              type: "string",
              enum: event.target.value
                ? psqlEnums.find((item) => item.id === event.target.value)?.values
                : undefined,
            })
          }
        >
          <option value="">None</option>
          {psqlEnums.map((psqlEnum) => (
            <option key={psqlEnum.id} value={psqlEnum.id}>
              {psqlEnum.name || "unnamed_enum"}
            </option>
          ))}
        </select>
      </label>
    ) : null}

    <label className="checkbox-field">
      <input
        type="checkbox"
        checked={field.nullable}
        onChange={(event) => onChange({ nullable: event.target.checked })}
      />
      nullable
    </label>

    <label>
      Description
      <textarea
        rows={2}
        placeholder="Optional"
        value={field.description ?? ""}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </label>
  </div>
);

type MethodPanelProps = {
  method: RestResourceMethod;
  onChange: (
    updater: (method: RestResourceMethod) => RestResourceMethod,
  ) => void;
  onAddInput: () => void;
  editingInputId: string | null;
  setEditingInput: (inputId: string | null) => void;
  onUpdateInput: (
    inputId: string,
    patch: Partial<RestMethodInputField>,
  ) => void;
  onDeleteInput: (inputId: string) => void;
};

const MethodPanel = ({
  method,
  onChange,
  onAddInput,
  editingInputId,
  setEditingInput,
  onUpdateInput,
  onDeleteInput,
}: MethodPanelProps) => (
  <div className="method-row__panel">
    <div className="method-row__inputs">
      <span className="eyebrow">Inputs</span>

      {method.input.length === 0 ? (
        <p className="block-node__empty">No inputs.</p>
      ) : null}

      {method.input.map((input) => {
        const isEditing = editingInputId === input.id;

        return (
          <div
            key={input.id}
            className={`field-row field-row--sub nodrag${isEditing ? " field-row--active" : ""}`}
            role="button"
            tabIndex={0}
            onClick={(event) => {
              event.stopPropagation();
              setEditingInput(input.id);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                setEditingInput(input.id);
              }
            }}
          >
            <span className="field-row__name">{input.name || "—"}</span>
            <span className="field-row__type">{input.type}</span>
            <span className="field-row__flags">
              <span
                className={`flag-chip flag-chip--${
                  input.mode === "query" ? "query" : "payload"
                }`}
              >
                {input.mode}
              </span>
            </span>

            {isEditing ? (
              <RowEditPopover onClose={() => setEditingInput(null)}>
                <InputPopover
                  input={input}
                  onChange={(patch) => onUpdateInput(input.id, patch)}
                  onDelete={() => onDeleteInput(input.id)}
                  onClose={() => setEditingInput(null)}
                />
              </RowEditPopover>
            ) : null}
          </div>
        );
      })}

      <button
        type="button"
        className="field-row field-row--button field-row--sub nodrag"
        onClick={(event) => {
          event.stopPropagation();
          onAddInput();
        }}
      >
        + Add input
      </button>
    </div>

    <label className="checkbox-field method-row__returns">
      <input
        type="checkbox"
        checked={method.output.returnsArray}
        onChange={(event) =>
          onChange((current) => ({
            ...current,
            output: {
              ...current.output,
              returnsArray: event.target.checked,
            },
          }))
        }
      />
      Returns array (output := resource schema)
    </label>
  </div>
);

type InputPopoverProps = {
  input: RestMethodInputField;
  onChange: (patch: Partial<RestMethodInputField>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const InputPopover = ({
  input,
  onChange,
  onDelete,
  onClose,
}: InputPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Input</span>
      <TrashButton ariaLabel="Remove input" onClick={onDelete} />
    </div>

    <label>
      Name
      <input
        autoFocus
        placeholder="param"
        value={input.name}
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
        <select
          value={input.type}
          disabled={input.mode === "query"}
          onChange={(event) =>
            onChange({
              type: event.target.value as RestMethodInputField["type"],
            })
          }
        >
          {(input.mode === "query" ? ["string"] : jsonFieldTypes).map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <label>
        Mode
        <select
          value={input.mode}
          onChange={(event) => {
            if (event.target.value === "query") {
              onChange({ mode: "query", type: "string" });
              return;
            }

            onChange({ mode: "payload", type: input.type });
          }}
        >
          {restMethodInputModes.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
      </label>
    </div>

    <label>
      Description
      <textarea
        rows={2}
        placeholder="Optional"
        value={input.description ?? ""}
        onChange={(event) => onChange({ description: event.target.value })}
      />
    </label>
  </div>
);

type AddMethodRowProps = {
  options: RestMethodKind[];
  onAdd: (kind: RestMethodKind) => void;
};

const AddMethodRow = ({ options, onAdd }: AddMethodRowProps) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="add-method-anchor">
      <button
        type="button"
        className={`field-row field-row--button nodrag${open ? " field-row--active" : ""}`}
        onClick={() => setOpen((current) => !current)}
      >
        + Add method
      </button>
      {open ? (
        <RowEditPopover onClose={() => setOpen(false)}>
          <div className="row-popover__inner">
            <span className="eyebrow">Add method</span>
            <div className="chip-picker chip-picker--column">
              {options.map((kind) => (
                <button
                  key={kind}
                  type="button"
                  className="inline-button"
                  onClick={() => {
                    onAdd(kind);
                    setOpen(false);
                  }}
                >
                  <span className={`method-pill ${httpVerbClass(kind)}`}>
                    {kind}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </RowEditPopover>
      ) : null}
    </div>
  );
};
