import type { NodeProps } from "@xyflow/react";
import { useDiagramContext } from "../../app/diagramContext";
import {
  getWildcardInputEndpoint,
  getWildcardOutputEndpoint,
} from "../../domain/connectionEndpoints";
import { createWildcardChild } from "../../domain/model";
import type { EssaNode, WildcardChild, WildcardData } from "../../domain/types";
import { BlockTextareaInput } from "../blockEditors/BlockTextareaInput";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockNodeFrame } from "./BlockNodeFrame";
import { ConnectionHandle, getConnectionUiState } from "./ConnectionHandle";

type WildcardNodeProps = NodeProps<EssaNode> & {
  data: WildcardData;
};

const updateChild = (
  children: WildcardChild[],
  childId: string,
  patch: Partial<WildcardChild>,
) =>
  children.map((child) =>
    child.id === childId ? { ...child, ...patch } : child,
  );

export const WildcardNode = ({ id, data, selected }: WildcardNodeProps) => {
  const ctx = useDiagramContext();
  const connectionState = getConnectionUiState(data);
  const inputEndpoint = getWildcardInputEndpoint(id);
  const outputEndpoint = getWildcardOutputEndpoint(id);

  return (
    <BlockNodeFrame
      id={id}
      selected={selected}
      badge="Wildcard"
      variant="wildcard"
      title={data.name}
      titlePlaceholder="Wildcard"
      titleAriaLabel="Wildcard name"
      deleteAriaLabel="Delete wildcard"
      onTitleChange={(next) => ctx.onUpdateNodeData(id, { name: next })}
    >
      <ConnectionHandle
        endpoint={inputEndpoint}
        state={connectionState}
      />
      <ConnectionHandle
        endpoint={outputEndpoint}
        state={connectionState}
      />

      <BlockTextareaInput
        nodeId={id}
        aria-label="Wildcard description"
        className="block-node__description-input nodrag nowheel"
        placeholder="Context"
        rows={2}
        committedValue={data.description ?? ""}
        onCommit={(next) => ctx.onUpdateNodeData(id, { description: next })}
      />

      <section className="block-node__section">
        <h4 className="block-node__section-title">Children</h4>

        {data.children.map((child) => (
          <div key={child.id} className="wildcard-child-row">
            <div className="wildcard-child-row__body">
              <input
                aria-label="Child name"
                className="wildcard-child-row__input nodrag nowheel"
                placeholder="Name"
                value={child.name}
                onChange={(event) =>
                  ctx.onUpdateNodeData(id, {
                    children: updateChild(data.children, child.id, {
                      name: event.target.value,
                    }),
                  })
                }
              />
              <textarea
                aria-label="Child description"
                className="wildcard-child-row__description nodrag nowheel"
                placeholder="Context"
                rows={1}
                value={child.description ?? ""}
                onChange={(event) =>
                  ctx.onUpdateNodeData(id, {
                    children: updateChild(data.children, child.id, {
                      description: event.target.value,
                    }),
                  })
                }
              />
            </div>
            <TrashButton
              ariaLabel="Delete child"
              onClick={() =>
                ctx.onUpdateNodeData(id, {
                  children: data.children.filter(
                    (item) => item.id !== child.id,
                  ),
                })
              }
            />
          </div>
        ))}

        <button
          type="button"
          className="field-row field-row--button nodrag"
          onClick={() => {
            const nextChild = createWildcardChild();
            ctx.onUpdateNodeData(id, {
              children: [...data.children, nextChild],
            });
          }}
        >
          + Add child
        </button>
      </section>
    </BlockNodeFrame>
  );
};
