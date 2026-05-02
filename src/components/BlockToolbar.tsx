import { blockList } from "../domain/model";
import type { BlockKind } from "../domain/types";

type BlockToolbarProps = {
  onAddNode: (kind: BlockKind, position?: { x: number; y: number }) => string;
};

export const BlockToolbar = ({ onAddNode }: BlockToolbarProps) => (
  <div className="floating-dock" role="toolbar" aria-label="Add block">
    {blockList.map(({ kind, label }, index) => (
      <span key={kind} style={{ display: "contents" }}>
        {index > 0 ? <span aria-hidden className="floating-dock__divider" /> : null}
        <button
          className="floating-dock__button"
          type="button"
          onClick={() => onAddNode(kind)}
        >
          <span className={`floating-dock__dot floating-dock__dot--${kind}`} />
          {label}
        </button>
      </span>
    ))}
  </div>
);
