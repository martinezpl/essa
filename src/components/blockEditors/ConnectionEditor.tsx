import { useDiagramContext } from "../../app/diagramContext";
import {
  getBlockTitle,
  getCompatibleConnectionKinds,
  hydrateBlock,
} from "../../domain/model";
import { getResourceSchemaOptions } from "../../domain/resourceSchema";
import type { ConnectionKind, DiagramEdge } from "../../domain/types";
import { TrashButton } from "./TrashButton";

type ConnectionEditorProps = {
  edge: DiagramEdge;
};

export const ConnectionEditor = ({ edge }: ConnectionEditorProps) => {
  const ctx = useDiagramContext();
  const sourceNode = ctx.nodes.find((item) => item.id === edge.source);
  const targetNode = ctx.nodes.find((item) => item.id === edge.target);
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
        <select
          disabled={kindOptions.length <= 1}
          value={edge.data.kind}
          onChange={(event) =>
            ctx.onUpdateEdgeData(edge.id, {
              kind: event.target.value as ConnectionKind,
            })
          }
        >
          {kindOptions.map((kind) => (
            <option key={kind} value={kind}>
              {kind}
            </option>
          ))}
        </select>
      </label>

      <label>
        Data
        <select
          value={edge.data.dataPath || "all"}
          onChange={(event) =>
            ctx.onUpdateEdgeData(edge.id, { dataPath: event.target.value })
          }
        >
          {optionList.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
};
