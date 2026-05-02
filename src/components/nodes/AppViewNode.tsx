import { useState } from "react";
import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import { getBlockTitle } from "../../domain/model";
import { getResourceSchemaOptions } from "../../domain/resourceSchema";
import type {
  AppViewComponent,
  AppViewData,
  BlockData,
  DiagramNode,
  EssaNode,
} from "../../domain/types";
import { updateComponent } from "../blockEditors/helpers";
import { RowEditPopover } from "../blockEditors/RowEditPopover";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type AppViewNodeProps = NodeProps<EssaNode> & {
  data: AppViewData;
};

export const AppViewNode = ({ id, data, selected }: AppViewNodeProps) => {
  const ctx = useDiagramContext();
  const [editingId, setEditingId] = useState<string | null>(null);
  const closeEditing = () => setEditingId(null);

  const connectedResources = ctx.nodes.filter(
    (
      item,
    ): item is DiagramNode & {
      data: Extract<BlockData, { kind: "restResource" }>;
    } =>
      item.data.kind === "restResource" &&
      ctx.edges.some(
        (edge) =>
          (edge.source === id && edge.target === item.id) ||
          (edge.source === item.id && edge.target === id),
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
    <article
      className={`block-node block-node--view block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
    >
      <BlockHandles kind="appView" />

      <header className="block-node__head">
        <span className="block-node__badge">App view</span>
        <span className="block-node__head-spacer" />
        <span className="block-node__head-trash">
          <TrashButton
            ariaLabel="Delete app view"
            onClick={() => ctx.onDeleteNode(id)}
          />
        </span>
      </header>

      <input
        aria-label="Route"
        className={`block-node__title-input nodrag${
          data.route ? "" : " block-node__title-input--placeholder"
        }`}
        placeholder="/route"
        value={data.route}
        onChange={(event) =>
          ctx.onUpdateNodeData(id, { route: event.target.value })
        }
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Components</h4>

        {data.components.map((component) => {
          const isEditing = editingId === component.id;

          return (
            <div
              key={component.id}
              className={`field-row nodrag${isEditing ? " field-row--active" : ""}`}
              role="button"
              tabIndex={0}
              onClick={() => setEditingId(component.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setEditingId(component.id);
                }
              }}
            >
              <span className="field-row__name">
                {component.name || "untitled"}
              </span>
              <span className="field-row__type">
                {component.dataUsage
                  ? `${component.dataUsage.operation}·${component.dataUsage.dataPath}`
                  : "—"}
              </span>

              {isEditing ? (
                <RowEditPopover onClose={closeEditing}>
                  <ComponentPopover
                    component={component}
                    connectedResources={connectedResources}
                    getResourceSchema={getResourceSchema}
                    onChange={(patch) =>
                      ctx.onReplaceAppComponents(
                        id,
                        updateComponent(data.components, component.id, patch),
                      )
                    }
                    onDelete={() => {
                      ctx.onReplaceAppComponents(
                        id,
                        data.components.filter(
                          (item) => item.id !== component.id,
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
          onClick={() => ctx.onAddAppComponent(id)}
        >
          + Add component
        </button>
      </section>
    </article>
  );
};

type ConnectedResourceNode = DiagramNode & {
  data: Extract<BlockData, { kind: "restResource" }>;
};

type ComponentPopoverProps = {
  component: AppViewComponent;
  connectedResources: ConnectedResourceNode[];
  getResourceSchema: (
    resourceId: string,
  ) => Extract<BlockData, { kind: "restResource" }>["schema"];
  onChange: (patch: Partial<AppViewComponent>) => void;
  onDelete: () => void;
  onClose: () => void;
};

const ComponentPopover = ({
  component,
  connectedResources,
  getResourceSchema,
  onChange,
  onDelete,
  onClose,
}: ComponentPopoverProps) => (
  <div className="row-popover__inner">
    <div className="row-popover__header">
      <span className="eyebrow">Component</span>
      <TrashButton ariaLabel="Remove component" onClick={onDelete} />
    </div>

    <label>
      Name
      <input
        autoFocus
        placeholder="Component name"
        value={component.name}
        onChange={(event) => onChange({ name: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onClose();
          }
        }}
      />
    </label>

    <label>
      Resource
      <select
        value={component.dataUsage?.resourceId ?? ""}
        onChange={(event) => {
          const resourceId = event.target.value;
          onChange({
            dataUsage: resourceId
              ? {
                  resourceId,
                  operation: component.dataUsage?.operation ?? "read",
                  dataPath: component.dataUsage?.dataPath ?? "all",
                }
              : undefined,
          });
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
              if (!dataUsage) return;
              onChange({
                dataUsage: {
                  ...dataUsage,
                  operation: event.target.value as "read" | "write",
                },
              });
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
              if (!dataUsage) return;
              onChange({
                dataUsage: { ...dataUsage, dataPath: event.target.value },
              });
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
);
