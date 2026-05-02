import { useDiagramContext } from "../../app/diagramContext";
import { jsonFieldTypes, restMethods } from "../../domain/options";
import type {
  ResourceSchemaField,
  RestMethodKind,
  RestResourceData,
} from "../../domain/types";
import {
  httpVerbClass,
  toggleFieldSelection,
  updateSchemaField,
} from "./helpers";
import { TrashButton } from "./TrashButton";

type RestResourceEditorProps = {
  nodeId: string;
  data: RestResourceData;
};

export const RestResourceEditor = ({ nodeId, data }: RestResourceEditorProps) => {
  const ctx = useDiagramContext();

  return (
    <div className="block-editor nowheel">
      <div className="block-editor__header">
        <div>
          <span className="block-editor__kind block-editor__kind--restResource">
            Resource
          </span>
        </div>
        <TrashButton
          ariaLabel="Delete resource"
          onClick={() => ctx.onDeleteNode(nodeId)}
        />
      </div>

      <label>
        Resource name
        <input
          placeholder="items"
          value={data.resourceName}
          onChange={(event) =>
            ctx.onUpdateNodeData(nodeId, { resourceName: event.target.value })
          }
        />
      </label>

      <div className="field-group">
        <div className="field-group__header">
          <h3>JSON schema</h3>
          <button
            className="button-subtle"
            type="button"
            onClick={() => ctx.onAddResourceSchemaField(nodeId, data.schema)}
          >
            + Add
          </button>
        </div>

        {data.schema.length === 0 ? (
          <p className="block-node__empty">
            Connect to a SQL table or add fields manually.
          </p>
        ) : (
          data.schema.map((field) => (
            <div
              className="schema-editor"
              key={`${field.id}-${field.sourceTableId}-${field.sourceColumnId}`}
            >
              <div className="row">
                <input
                  aria-label="Schema field name"
                  placeholder="field"
                  value={field.name}
                  onChange={(event) =>
                    ctx.onReplaceResourceSchema(
                      nodeId,
                      updateSchemaField(data.schema, field.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                />
                <select
                  aria-label="Schema field type"
                  value={field.type}
                  onChange={(event) =>
                    ctx.onReplaceResourceSchema(
                      nodeId,
                      updateSchemaField(data.schema, field.id, {
                        type: event.target.value as ResourceSchemaField["type"],
                      }),
                    )
                  }
                >
                  {jsonFieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div className="row">
                <label className="checkbox-field">
                  <input
                    checked={field.nullable}
                    type="checkbox"
                    onChange={(event) =>
                      ctx.onReplaceResourceSchema(
                        nodeId,
                        updateSchemaField(data.schema, field.id, {
                          nullable: event.target.checked,
                        }),
                      )
                    }
                  />
                  nullable
                </label>
                <span className="row__shrink">
                  <TrashButton
                    ariaLabel="Remove field"
                    onClick={() =>
                      ctx.onReplaceResourceSchema(
                        nodeId,
                        data.schema.filter((item) => item.id !== field.id),
                      )
                    }
                  />
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="field-group">
        <div className="field-group__header">
          <h3>Methods</h3>
          <select
            aria-label="Add method"
            value=""
            onChange={(event) => {
              if (!event.target.value) {
                return;
              }

              ctx.onAddRestMethod(nodeId, event.target.value as RestMethodKind);
            }}
          >
            <option value="">+ Add method</option>
            {restMethods
              .filter(
                (method) => !data.methods.some((item) => item.kind === method),
              )
              .map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
          </select>
        </div>

        {data.methods.length === 0 ? (
          <p className="block-node__empty">No methods yet.</p>
        ) : null}

        {data.methods.map((method) => {
          const fieldOptions = [
            "all",
            ...data.schema.map((field) => field.name).filter(Boolean),
          ];

          return (
            <div className="method-editor" key={method.id}>
              <div className="method-editor__head">
                <span className={`method-pill ${httpVerbClass(method.kind)}`}>
                  {method.kind}
                </span>
                <TrashButton
                  ariaLabel={`Remove ${method.kind}`}
                  onClick={() => ctx.onRemoveRestMethod(nodeId, method.id)}
                />
              </div>

              <label className="checkbox-field">
                <input
                  checked={Boolean(method.input)}
                  type="checkbox"
                  onChange={(event) =>
                    ctx.onUpdateRestMethod(nodeId, method.id, (current) => ({
                      ...current,
                      input: event.target.checked
                        ? {
                            mode:
                              current.kind === "GET /" ||
                              current.kind === "GET /{id}"
                                ? "query"
                                : "payload",
                            fields:
                              current.kind === "GET /" ||
                              current.kind === "GET /{id}"
                                ? []
                                : ["all"],
                          }
                        : undefined,
                    }))
                  }
                />
                Has input
              </label>

              {method.input ? (
                <>
                  <label>
                    Input type
                    <select
                      value={method.input.mode}
                      onChange={(event) =>
                        ctx.onUpdateRestMethod(nodeId, method.id, (current) => ({
                          ...current,
                          input: current.input
                            ? {
                                ...current.input,
                                mode: event.target.value as "payload" | "query",
                              }
                            : undefined,
                        }))
                      }
                    >
                      <option value="payload">payload</option>
                      <option value="query">query params</option>
                    </select>
                  </label>

                  <div className="field-picker">
                    <span className="eyebrow">Input fields</span>
                    {fieldOptions.map((field) => (
                      <label className="checkbox-field" key={field}>
                        <input
                          checked={Boolean(
                            (
                              method.input?.fields as string[] | undefined
                            )?.includes(field),
                          )}
                          type="checkbox"
                          onChange={(event) =>
                            ctx.onUpdateRestMethod(nodeId, method.id, (current) => ({
                              ...current,
                              input: current.input
                                ? {
                                    ...current.input,
                                    fields: toggleFieldSelection(
                                      current.input.fields,
                                      field,
                                      event.target.checked,
                                    ),
                                  }
                                : undefined,
                            }))
                          }
                        />
                        {field}
                      </label>
                    ))}
                  </div>
                </>
              ) : null}

              <div className="field-picker">
                <span className="eyebrow">Output fields</span>
                {fieldOptions.map((field) => (
                  <label className="checkbox-field" key={field}>
                    <input
                      checked={method.output.fields.includes(field)}
                      type="checkbox"
                      onChange={(event) =>
                        ctx.onUpdateRestMethod(nodeId, method.id, (current) => ({
                          ...current,
                          output: {
                            ...current.output,
                            fields: toggleFieldSelection(
                              current.output.fields,
                              field,
                              event.target.checked,
                            ),
                          },
                        }))
                      }
                    />
                    {field}
                  </label>
                ))}
              </div>

              <label className="checkbox-field">
                <input
                  checked={method.output.returnsArray}
                  type="checkbox"
                  onChange={(event) =>
                    ctx.onUpdateRestMethod(nodeId, method.id, (current) => ({
                      ...current,
                      output: {
                        ...current.output,
                        returnsArray: event.target.checked,
                      },
                    }))
                  }
                />
                Returns array
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
};
