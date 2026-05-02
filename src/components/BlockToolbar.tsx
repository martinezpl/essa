import { blockList } from "../domain/model";
import type { BlockKind } from "../domain/types";

type BlockToolbarProps = {
  onAddNode: (kind: BlockKind, position?: { x: number; y: number }) => string;
};

export const BlockToolbar = ({ onAddNode }: BlockToolbarProps) => (
  <div className="toolbar">
    <span className="eyebrow">Add block</span>
    <div className="toolbar__actions">
      {blockList.map(({ kind, label }) => (
        <button key={kind} type="button" onClick={() => onAddNode(kind)}>
          {label}
        </button>
      ))}
    </div>
  </div>
);
