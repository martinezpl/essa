import { jsonFieldTypes, postgresTypes, restMethods } from "../domain/options";
import { getBlockTitle } from "../domain/model";
import { getResourceSchemaOptions } from "../domain/resourceSchema";
import type {
  AppViewComponent,
  BlockData,
  ConnectionKind,
  DiagramEdge,
  DiagramNode,
  EdgeData,
  ResourceSchemaField,
  RestMethodKind,
  RestResourceMethod,
  SqlColumn,
} from "../domain/types";

type InspectorProps = {
  edge?: DiagramEdge;
  edges: DiagramEdge[];
  node?: DiagramNode;
  nodes: DiagramNode[];
  resourceSchemas: Map<string, ResourceSchemaField[]>;
  onAddAppComponent: (nodeId: string) => void;
  onAddResourceSchemaField: (
    nodeId: string,
    currentSchema: ResourceSchemaField[],
  ) => void;
  onAddRestMethod: (nodeId: string, kind: RestMethodKind) => void;
  onAddSqlColumn: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onReplaceAppComponents: (
    nodeId: string,
    components: AppViewComponent[],
  ) => void;
  onReplaceResourceSchema: (
    nodeId: string,
    schema: ResourceSchemaField[],
  ) => void;
  onReplaceSqlColumns: (nodeId: string, columns: SqlColumn[]) => void;
  onRemoveRestMethod: (nodeId: string, methodId: string) => void;
  onUpdateEdgeData: (edgeId: string, patch: Partial<EdgeData>) => void;
  onUpdateNodeData: (nodeId: string, patch: Partial<BlockData>) => void;
  onUpdateRestMethod: (
    nodeId: string,
    methodId: string,
    updater: (method: RestResourceMethod) => RestResourceMethod,
  ) => void;
};

const updateComponent = (
  components: AppViewComponent[],
  componentId: string,
  patch: Partial<AppViewComponent>,
) =>
  components.map((component) =>
    component.id === componentId ? { ...component, ...patch } : component,
  );

const updateColumn = (
  columns: SqlColumn[],
  columnId: string,
  patch: Partial<SqlColumn>,
) =>
  columns.map((column) =>
    column.id === columnId ? { ...column, ...patch } : column,
  );

const updateSchemaField = (
  schema: ResourceSchemaField[],
  fieldId: string,
  patch: Partial<ResourceSchemaField>,
) =>
  schema.map((field) =>
    field.id === fieldId ? { ...field, ...patch } : field,
  );

const toggleFieldSelection = (
  fields: string[],
  field: string,
  checked: boolean,
) => {
  if (field === "all") {
    return checked ? ["all"] : [];
  }

  const withoutAll = fields.filter((item) => item !== "all");

  if (checked) {
    return [...withoutAll, field];
  }

  return withoutAll.filter((item) => item !== field);
};

const getNodeTitle = (item?: DiagramNode) => {
  return item ? getBlockTitle(item) : "";
};

export const Inspector = ({
  edge,
  edges,
  node,
  nodes,
  resourceSchemas,
  onAddAppComponent,
  onAddResourceSchemaField,
  onAddRestMethod,
  onAddSqlColumn,
  onDeleteEdge,
  onDeleteNode,
  onReplaceAppComponents,
  onReplaceResourceSchema,
  onReplaceSqlColumns,
  onRemoveRestMethod,
  onUpdateEdgeData,
  onUpdateNodeData,
  onUpdateRestMethod,
}: InspectorProps) => {
  if (edge) {
    const sourceNode = nodes.find((item) => item.id === edge.source);
    const targetNode = nodes.find((item) => item.id === edge.target);
    const dataOptions = new Set<string>(["all"]);

    if (sourceNode?.data.kind === "appView") {
      sourceNode.data.components.forEach((component) =>
        dataOptions.add(component.name),
      );
    }

    if (sourceNode?.data.kind === "restResource") {
      getResourceSchemaOptions(sourceNode.data.schema).forEach((option) =>
        dataOptions.add(option),
      );
    }

    if (sourceNode?.data.kind === "sqlTable") {
      sourceNode.data.columns.forEach((column) => dataOptions.add(column.name));
    }

    if (targetNode?.data.kind === "sqlTable") {
      targetNode.data.columns.forEach((column) => dataOptions.add(column.name));
    }

    return (
      <aside className="inspector">
        <span className="eyebrow">Inspector</span>
        <h2>Connection</h2>
        <p>
          {getNodeTitle(sourceNode) || "Source"} to{" "}
          {getNodeTitle(targetNode) || "Target"}
        </p>

        <label>
          Type
          <select
            value={edge.data.kind}
            onChange={(event) =>
              onUpdateEdgeData(edge.id, {
                kind: event.target.value as ConnectionKind,
              })
            }
          >
            <option value="read">read</option>
            <option value="write">write</option>
          </select>
        </label>

        <label>
          Data
          <select
            value={edge.data.dataPath || "all"}
            onChange={(event) =>
              onUpdateEdgeData(edge.id, { dataPath: event.target.value })
            }
          >
            {[...dataOptions].filter(Boolean).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        <button
          className="button-danger"
          type="button"
          onClick={() => onDeleteEdge(edge.id)}
        >
          Delete connection
        </button>
      </aside>
    );
  }

  if (!node) {
    return (
      <aside className="inspector">
        <span className="eyebrow">Inspector</span>
        <h2>Select a block</h2>
        <p>Choose a canvas block to edit its model details.</p>
      </aside>
    );
  }

  const data = node.data;
  const connectedResources = nodes.filter(
    (
      item,
    ): item is DiagramNode & {
      data: Extract<BlockData, { kind: "restResource" }>;
    } =>
      item.data.kind === "restResource" &&
      edges.some(
        (itemEdge) =>
          (itemEdge.source === node.id && itemEdge.target === item.id) ||
          (itemEdge.source === item.id && itemEdge.target === node.id),
      ),
  );
  const getCurrentResourceSchema = (resourceId: string) => {
    const resource = nodes.find(
      (
        item,
      ): item is DiagramNode & {
        data: Extract<BlockData, { kind: "restResource" }>;
      } => item.id === resourceId && item.data.kind === "restResource",
    );

    return resource?.data.schema ?? resourceSchemas.get(resourceId) ?? [];
  };

  return (
    <aside className="inspector">
      <span className="eyebrow">Inspector</span>
      <div className="field-group__header">
        <h2>{getNodeTitle(node)}</h2>
        <button
          className="button-danger"
          type="button"
          onClick={() => onDeleteNode(node.id)}
        >
          Delete
        </button>
      </div>

      {data.kind === "appView" ? (
        <>
          <label>
            Route
            <input
              value={data.route}
              onChange={(event) =>
                onUpdateNodeData(node.id, { route: event.target.value })
              }
            />
          </label>

          <div className="field-group">
            <div className="field-group__header">
              <h3>Components</h3>
              <button type="button" onClick={() => onAddAppComponent(node.id)}>
                Add
              </button>
            </div>
            {data.components.map((component) => (
              <div className="stacked-field" key={component.id}>
                <input
                  value={component.name}
                  onChange={(event) =>
                    onReplaceAppComponents(
                      node.id,
                      updateComponent(data.components, component.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                />

                <label>
                  Resource
                  <select
                    value={component.dataUsage?.resourceId ?? ""}
                    onChange={(event) => {
                      const resourceId = event.target.value;

                      onReplaceAppComponents(
                        node.id,
                        updateComponent(data.components, component.id, {
                          dataUsage: resourceId
                            ? {
                                resourceId,
                                operation:
                                  component.dataUsage?.operation ?? "read",
                                dataPath:
                                  component.dataUsage?.dataPath ?? "all",
                              }
                            : undefined,
                        }),
                      );
                    }}
                  >
                    <option value="">No resource</option>
                    {connectedResources.map((resource) => (
                      <option key={resource.id} value={resource.id}>
                        {getNodeTitle(resource)}
                      </option>
                    ))}
                  </select>
                </label>

                {component.dataUsage ? (
                  <>
                    <label>
                      Operation
                      <select
                        value={component.dataUsage.operation}
                        onChange={(event) => {
                          const dataUsage = component.dataUsage;

                          if (!dataUsage) {
                            return;
                          }

                          onReplaceAppComponents(
                            node.id,
                            updateComponent(data.components, component.id, {
                              dataUsage: {
                                ...dataUsage,
                                operation: event.target.value as
                                  | "read"
                                  | "write",
                              },
                            }),
                          );
                        }}
                      >
                        <option value="read">read</option>
                        <option value="write">write</option>
                      </select>
                    </label>

                    <label>
                      Data
                      <select
                        value={component.dataUsage.dataPath}
                        onChange={(event) => {
                          const dataUsage = component.dataUsage;

                          if (!dataUsage) {
                            return;
                          }

                          onReplaceAppComponents(
                            node.id,
                            updateComponent(data.components, component.id, {
                              dataUsage: {
                                ...dataUsage,
                                dataPath: event.target.value,
                              },
                            }),
                          );
                        }}
                      >
                        {getResourceSchemaOptions(
                          getCurrentResourceSchema(component.dataUsage.resourceId),
                        ).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {data.kind === "restResource" ? (
        <>
          <label>
            Resource name
            <input
              value={data.resourceName}
              onChange={(event) =>
                onUpdateNodeData(node.id, { resourceName: event.target.value })
              }
            />
          </label>

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

                  onAddRestMethod(node.id, event.target.value as RestMethodKind);
                }}
              >
                <option value="">Add method</option>
                {restMethods
                  .filter(
                    (method) =>
                      !data.methods.some((item) => item.kind === method),
                  )
                  .map((method) => (
                    <option key={method} value={method}>
                      {method}
                    </option>
                  ))}
              </select>
            </div>
            {data.methods.map((method) => {
              const fieldOptions = [
                "all",
                ...data.schema.map((field) => field.name).filter(Boolean),
              ];

              return (
                <div className="method-editor" key={method.id}>
                  <div className="field-group__header">
                    <strong>{method.kind}</strong>
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() => onRemoveRestMethod(node.id, method.id)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="field-group">
                    <label className="checkbox-field">
                      <input
                        checked={Boolean(method.input)}
                        type="checkbox"
                        onChange={(event) =>
                          onUpdateRestMethod(node.id, method.id, (current) => ({
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
                      input
                    </label>

                    {method.input ? (
                      <>
                        <label>
                          Input type
                          <select
                            value={method.input.mode}
                            onChange={(event) =>
                              onUpdateRestMethod(
                                node.id,
                                method.id,
                                (current) => ({
                                  ...current,
                                  input: current.input
                                    ? {
                                        ...current.input,
                                        mode: event.target.value as
                                          | "payload"
                                          | "query",
                                      }
                                    : undefined,
                                }),
                              )
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
                                  (method.input?.fields as string[] | undefined)?.includes(field),
                                )}
                                type="checkbox"
                                onChange={(event) =>
                                  onUpdateRestMethod(
                                    node.id,
                                    method.id,
                                    (current) => ({
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
                                    }),
                                  )
                                }
                              />
                              {field}
                            </label>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="field-group">
                    <div className="field-picker">
                      <span className="eyebrow">Output fields</span>
                      {fieldOptions.map((field) => (
                        <label className="checkbox-field" key={field}>
                          <input
                            checked={method.output.fields.includes(field)}
                            type="checkbox"
                            onChange={(event) =>
                              onUpdateRestMethod(node.id, method.id, (current) => ({
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
                          onUpdateRestMethod(node.id, method.id, (current) => ({
                            ...current,
                            output: {
                              ...current.output,
                              returnsArray: event.target.checked,
                            },
                          }))
                        }
                      />
                      returns array
                    </label>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="field-group">
            <div className="field-group__header">
              <h3>JSON schema</h3>
              <button
                type="button"
                onClick={() => onAddResourceSchemaField(node.id, data.schema)}
              >
                Add
              </button>
            </div>
            {data.schema.length > 0 ? (
              <div className="schema-list">
                {data.schema.map((field) => (
                  <div
                    className="schema-editor"
                    key={`${field.id}-${field.sourceTableId}-${field.sourceColumnId}-${field.name}`}
                  >
                    <input
                      aria-label="Schema field name"
                      value={field.name}
                      onChange={(event) =>
                        onReplaceResourceSchema(
                          node.id,
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
                        onReplaceResourceSchema(
                          node.id,
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
                    <label className="checkbox-field">
                      <input
                        checked={field.nullable}
                        type="checkbox"
                        onChange={(event) =>
                          onReplaceResourceSchema(
                            node.id,
                            updateSchemaField(data.schema, field.id, {
                              nullable: event.target.checked,
                            }),
                          )
                        }
                      />
                      nullable
                    </label>
                    <button
                      className="button-ghost"
                      type="button"
                      onClick={() =>
                        onReplaceResourceSchema(
                          node.id,
                          data.schema.filter((item) => item.id !== field.id),
                        )
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p>
                Add fields manually or connect this resource to a SQL table to start from
                a derived schema.
              </p>
            )}
          </div>
        </>
      ) : null}

      {data.kind === "sqlTable" ? (
        <>
          <label>
            Table name
            <input
              value={data.tableName}
              onChange={(event) =>
                onUpdateNodeData(node.id, { tableName: event.target.value })
              }
            />
          </label>

          <div className="field-group">
            <div className="field-group__header">
              <h3>Columns</h3>
              <button type="button" onClick={() => onAddSqlColumn(node.id)}>
                Add
              </button>
            </div>
            {data.columns.map((column) => (
              <div className="column-editor" key={column.id}>
                <input
                  value={column.name}
                  onChange={(event) =>
                    onReplaceSqlColumns(
                      node.id,
                      updateColumn(data.columns, column.id, {
                        name: event.target.value,
                      }),
                    )
                  }
                />
                <select
                  value={column.type}
                  onChange={(event) =>
                    onReplaceSqlColumns(
                      node.id,
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
                <label className="checkbox-field">
                  <input
                    checked={column.nullable}
                    type="checkbox"
                    onChange={(event) =>
                      onReplaceSqlColumns(
                        node.id,
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
                      onReplaceSqlColumns(
                        node.id,
                        updateColumn(data.columns, column.id, {
                          primaryKey: event.target.checked,
                        }),
                      )
                    }
                  />
                  primary
                </label>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </aside>
  );
};
