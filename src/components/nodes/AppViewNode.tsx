import { NodeToolbar, Position, type NodeProps } from "@xyflow/react";
import type { AppViewData, EssaNode } from "../../domain/types";
import { AppViewEditor } from "../blockEditors/AppViewEditor";
import { BlockHandles } from "./BlockHandles";

type AppViewNodeProps = NodeProps<EssaNode> & {
  data: AppViewData;
};

export const AppViewNode = ({ id, data, selected }: AppViewNodeProps) => (
  <>
    <article className="block-node block-node--view">
      <BlockHandles kind="appView" />
      <header className="block-node__head">
        <span className="block-node__badge">App view</span>
      </header>
      <h3
        className={`block-node__title${
          data.route ? "" : " block-node__title--placeholder"
        }`}
      >
        {data.route || "no route"}
      </h3>
      {data.components.length > 0 ? (
        <ul>
          {data.components.map((component) => (
            <li className="block-node__row" key={component.id}>
              <strong>{component.name || "untitled"}</strong>
              <span className="block-node__row-meta">
                {component.dataUsage
                  ? `${component.dataUsage.operation} · ${component.dataUsage.dataPath}`
                  : "—"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="block-node__empty">No components yet.</p>
      )}
    </article>
    <NodeToolbar isVisible={selected} position={Position.Right} offset={16}>
      <AppViewEditor nodeId={id} data={data} />
    </NodeToolbar>
  </>
);
