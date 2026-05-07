import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import {
  getRestMethodInputEndpoint,
  getRestMethodOutputEndpoint,
  parseRestMethodSourceHandleId,
  parseRestMethodTargetHandleId,
} from "../../domain/connectionEndpoints";
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
import { ComboInput } from "../blockEditors/ComboInput";
import { EditableFieldRow } from "../blockEditors/EditableFieldRow";
import { httpVerbClass, updateSchemaField } from "../blockEditors/helpers";
import { RowEditPopover } from "../blockEditors/RowEditPopover";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockNodeFrame } from "./BlockNodeFrame";
import {
  ConnectionHandle,
  getConnectionInteractionClass,
  getConnectionUiState,
} from "./ConnectionHandle";

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

export const RestResourceNode = ({
  id,
  data,
  selected,
}: RestResourceNodeProps) => {
  const ctx = useDiagramContext();
  const connectionState = getConnectionUiState(data);
  const [editing, setEditing] = useState<EditingTarget>(null);
  const [expandedMethodId, setExpandedMethodId] = useState<string | null>(null);
  const closeEditing = () => setEditing(null);
  const linkedMethodIds = new Set(
    ctx.edges.flatMap((edge) => {
      if (edge.target !== id) {
        const sourceMethodId =
          edge.source === id
            ? parseRestMethodSourceHandleId(edge.sourceHandle)
            : null;
        return sourceMethodId ? [sourceMethodId] : [];
      }

      const methodId = parseRestMethodTargetHandleId(edge.targetHandle);
      return methodId ? [methodId] : [];
    }),
  );

  const remainingMethodKinds = restMethods.filter(
    (method) => !data.methods.some((item) => item.kind === method),
  );

  return (
    <BlockNodeFrame
      id={id}
      selected={selected}
      badge="API"
      variant="resource"
      title={data.resourceName}
      titlePlaceholder="resource"
      titleAriaLabel="Resource name"
      deleteAriaLabel="Delete resource"
      onTitleChange={(next) => ctx.onUpdateNodeData(id, { resourceName: next })}
    >
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
            <EditableFieldRow
              key={`${field.id}-${field.sourceTableId}-${field.sourceColumnId}`}
              isEditing={isEditing}
              onOpen={() => setEditing({ kind: "schema", id: field.id })}
              onClose={closeEditing}
              popover={
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
              }
            >
              <span className="field-row__name">{field.name || "—"}</span>
              <span className="field-row__type">
                {formatResourceFieldType(field, ctx.psqlEnums)}
                {field.nullable ? "?" : ""}
              </span>
            </EditableFieldRow>
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
          const inputEndpoint = getRestMethodInputEndpoint(id, method);
          const outputEndpoint = getRestMethodOutputEndpoint(id, method);

          return (
            <div
              key={method.id}
              className={`method-row nodrag${
                expanded ? " method-row--expanded" : ""
              } ${getConnectionInteractionClass(inputEndpoint, connectionState)} ${getConnectionInteractionClass(
                outputEndpoint,
                connectionState,
              )}${linkedMethodIds.has(method.id) ? " method-row--linked" : ""}`}
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
                <ConnectionHandle
                  endpoint={inputEndpoint}
                  state={connectionState}
                />
                <ConnectionHandle
                  endpoint={outputEndpoint}
                  state={connectionState}
                />
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
    </BlockNodeFrame>
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
      <ComboInput
        ariaLabel="Schema field type"
        value={field.type}
        options={jsonFieldTypes}
        onChange={(value) =>
          onChange({
            type: value as ResourceSchemaField["type"],
            enum: undefined,
          })
        }
      />
    </label>

    {psqlEnums.length > 0 ? (
      <label>
        Enum
        <ComboInput
          ariaLabel="Schema field enum"
          value={getSelectedEnumId(field, psqlEnums)}
          options={[
            { value: "", label: "None" },
            ...psqlEnums.map((psqlEnum) => ({
              value: psqlEnum.id,
              label: psqlEnum.name || "unnamed_enum",
            })),
          ]}
          onChange={(value) =>
            onChange({
              type: "string",
              enum: value
                ? psqlEnums.find((item) => item.id === value)?.values
                : undefined,
            })
          }
        />
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

      {method.input.map((input) => {
        const isEditing = editingInputId === input.id;

        return (
          <EditableFieldRow
            key={input.id}
            variant="sub"
            stopPointerPropagation
            isEditing={isEditing}
            onOpen={() => setEditingInput(input.id)}
            onClose={() => setEditingInput(null)}
            popover={
              <InputPopover
                input={input}
                onChange={(patch) => onUpdateInput(input.id, patch)}
                onDelete={() => onDeleteInput(input.id)}
                onClose={() => setEditingInput(null)}
              />
            }
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
          </EditableFieldRow>
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
        <ComboInput
          ariaLabel="Input type"
          value={input.type}
          disabled={input.mode === "query"}
          options={input.mode === "query" ? ["string"] : jsonFieldTypes}
          onChange={(value) =>
            onChange({
              type: value as RestMethodInputField["type"],
            })
          }
        />
      </label>

      <label>
        Mode
        <ComboInput
          ariaLabel="Input mode"
          value={input.mode}
          options={restMethodInputModes}
          onChange={(value) => {
            if (value === "query") {
              onChange({ mode: "query", type: "string" });
              return;
            }

            onChange({ mode: "payload", type: input.type });
          }}
        />
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
