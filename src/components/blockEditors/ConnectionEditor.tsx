import { useDiagramContext } from "../../app/diagramContext";
import {
  getBlockTitle,
  getCompatibleConnectionKinds,
  hydrateBlock,
} from "../../domain/model";
import { getResourceSchemaOptions } from "../../domain/resourceSchema";
import type { ConnectionKind, DiagramEdge } from "../../domain/types";
import { ChipSelector } from "./ChipSelector";
import { ComboInput } from "./ComboInput";
import { TrashButton } from "./TrashButton";

type ConnectionEditorProps = {
  edge: DiagramEdge;
};

const parseSelectedDataPath = (dataPath: string | undefined) =>
  (dataPath || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

export const ConnectionEditor = ({ edge }: ConnectionEditorProps) => {
  const ctx = useDiagramContext();
  const sourceNode = ctx.nodes.find((item) => item.id === edge.source);
  const targetNode = ctx.nodes.find((item) => item.id === edge.target);
  const dataOptions = new Set<string>(["all"]);

  if (sourceNode?.data.kind === "restResource") {
    getResourceSchemaOptions(sourceNode.data.schema).forEach((option) =>
      dataOptions.add(option),
    );
  }

  if (sourceNode?.data.kind === "psqlTable") {
    sourceNode.data.columns.forEach((column) => dataOptions.add(column.name));
  }

  if (targetNode?.data.kind === "psqlTable") {
    targetNode.data.columns.forEach((column) => dataOptions.add(column.name));
  }

  const optionList = [...dataOptions].filter(Boolean);
  const allowedKinds =
    sourceNode && targetNode
      ? getCompatibleConnectionKinds(hydrateBlock(sourceNode), hydrateBlock(targetNode))
      : [];
  const kindOptions =
    allowedKinds.length > 0 ? allowedKinds : [edge.data.kind];
  const canSelectWrittenColumns =
    edge.data.kind !== "read" &&
    sourceNode?.data.kind === "restResource" &&
    targetNode?.data.kind === "psqlTable";
  const writtenColumnCandidates =
    canSelectWrittenColumns && targetNode?.data.kind === "psqlTable"
      ? targetNode.data.columns
          .filter((column) => column.name.trim())
          .map((column) => ({ id: column.name, name: column.name }))
      : [];
  const selectedWrittenColumns =
    edge.data.dataPath === "all"
      ? []
      : parseSelectedDataPath(edge.data.dataPath);

  return (
    <div className="connection-editor nowheel">
      <div className="block-editor__header">
        <div>
          <span className="block-editor__kind">Connection</span>
        </div>
        <TrashButton
          ariaLabel="Delete connection"
          onClick={() => ctx.onDeleteEdge(edge.id)}
        />
      </div>

      <p className="block-node__empty" style={{ fontStyle: "normal" }}>
        {sourceNode ? getBlockTitle(sourceNode) : "Source"}
        {" → "}
        {targetNode ? getBlockTitle(targetNode) : "Target"}
      </p>

      <label>
        Type
        <ComboInput
          ariaLabel="Connection type"
          disabled={kindOptions.length <= 1}
          value={edge.data.kind}
          options={kindOptions}
          onChange={(value) => {
            const kind = value as ConnectionKind;
            ctx.onUpdateEdgeData(edge.id, {
              kind,
              ...(kind === "read" ? { dataPath: "all" } : {}),
            });
          }}
        />
      </label>

      {edge.data.kind !== "read" ? (
        canSelectWrittenColumns ? (
          <>
            <label>
              Written columns
              <ComboInput
                ariaLabel="Written columns mode"
                value={edge.data.dataPath === "all" ? "all" : "selected"}
                options={[
                  { value: "all", label: "all" },
                  { value: "selected", label: "selected columns" },
                ]}
                onChange={(value) =>
                  ctx.onUpdateEdgeData(edge.id, {
                    dataPath:
                      value === "all"
                        ? "all"
                        : selectedWrittenColumns.join(", "),
                  })
                }
              />
            </label>
            {edge.data.dataPath !== "all" ? (
              <ChipSelector
                candidates={writtenColumnCandidates}
                value={selectedWrittenColumns}
                onChange={(columns) =>
                  ctx.onUpdateEdgeData(edge.id, {
                    dataPath: columns.join(", "),
                  })
                }
                emptyLabel="Add table columns first."
              />
            ) : null}
          </>
        ) : (
          <label>
            Data
            <ComboInput
              ariaLabel="Connection data"
              value={edge.data.dataPath || "all"}
              options={optionList}
              onChange={(value) =>
                ctx.onUpdateEdgeData(edge.id, { dataPath: value })
              }
            />
          </label>
        )
      ) : null}
    </div>
  );
};
