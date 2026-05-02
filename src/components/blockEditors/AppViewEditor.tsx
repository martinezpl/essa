import { useDiagramContext } from "../../app/diagramContext";
import { getBlockTitle } from "../../domain/model";
import { getResourceSchemaOptions } from "../../domain/resourceSchema";
import type {
  AppViewData,
  BlockData,
  DiagramNode,
} from "../../domain/types";
import { updateComponent } from "./helpers";
import { TrashButton } from "./TrashButton";

type AppViewEditorProps = {
  nodeId: string;
  data: AppViewData;
};

export const AppViewEditor = ({ nodeId, data }: AppViewEditorProps) => {
  const ctx = useDiagramContext();
  const connectedResources = ctx.nodes.filter(
    (
      item,
    ): item is DiagramNode & {
      data: Extract<BlockData, { kind: "restResource" }>;
    } =>
      item.data.kind === "restResource" &&
      ctx.edges.some(
        (itemEdge) =>
          (itemEdge.source === nodeId && itemEdge.target === item.id) ||
          (itemEdge.source === item.id && itemEdge.target === nodeId),
      ),
  );

  const getResourceSchema = (resourceId: string) => {
    const resource = ctx.nodes.find(
      (
        item,
      ): item is DiagramNode & {
        data: Extract<BlockData, { kind: "restResource" }>;
      } => item.id === resourceId && item.data.kind === "restResource",
    );

    return resource?.data.schema ?? ctx.resourceSchemas.get(resourceId) ?? [];
  };

  return (
    <div className="block-editor nowheel">
      <div className="block-editor__header">
        <div>
          <span className="block-editor__kind block-editor__kind--appView">
            App view
          </span>
        </div>
        <TrashButton
          ariaLabel="Delete app view"
          onClick={() => ctx.onDeleteNode(nodeId)}
        />
      </div>

      <label>
        Route
        <input
          placeholder="/dashboard"
          value={data.route}
          onChange={(event) =>
            ctx.onUpdateNodeData(nodeId, { route: event.target.value })
          }
        />
      </label>

      <div className="field-group">
        <div className="field-group__header">
          <h3>Components</h3>
          <button
            className="button-subtle"
            type="button"
            onClick={() => ctx.onAddAppComponent(nodeId)}
          >
            + Add
          </button>
        </div>

        {data.components.length === 0 ? (
          <p className="block-node__empty">No components yet.</p>
        ) : null}

        {data.components.map((component) => (
          <div className="stacked-field" key={component.id}>
            <div className="row">
              <input
                placeholder="Component name"
                value={component.name}
                onChange={(event) =>
                  ctx.onReplaceAppComponents(
                    nodeId,
                    updateComponent(data.components, component.id, {
                      name: event.target.value,
                    }),
                  )
                }
              />
              <span className="row__shrink">
                <TrashButton
                  ariaLabel="Remove component"
                  onClick={() =>
                    ctx.onReplaceAppComponents(
                      nodeId,
                      data.components.filter((item) => item.id !== component.id),
                    )
                  }
                />
              </span>
            </div>

            <label>
              Resource
              <select
                value={component.dataUsage?.resourceId ?? ""}
                onChange={(event) => {
                  const resourceId = event.target.value;

                  ctx.onReplaceAppComponents(
                    nodeId,
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
                    {getBlockTitle(resource)}
                  </option>
                ))}
              </select>
            </label>

            {component.dataUsage ? (
              <div className="row">
                <label>
                  Operation
                  <select
                    value={component.dataUsage.operation}
                    onChange={(event) => {
                      const dataUsage = component.dataUsage;

                      if (!dataUsage) {
                        return;
                      }

                      ctx.onReplaceAppComponents(
                        nodeId,
                        updateComponent(data.components, component.id, {
                          dataUsage: {
                            ...dataUsage,
                            operation: event.target.value as "read" | "write",
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

                      ctx.onReplaceAppComponents(
                        nodeId,
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
                      getResourceSchema(component.dataUsage.resourceId),
                    ).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}

          </div>
        ))}
      </div>
    </div>
  );
};
