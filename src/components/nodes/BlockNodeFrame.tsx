import { useCallback, useState, type ReactNode } from "react";
import { useDiagramContext } from "../../app/diagramContext";
import type { BlockKind } from "../../domain/types";
import { BlockTitleInput } from "../blockEditors/BlockTitleInput";
import { TrashButton } from "../blockEditors/TrashButton";
import { BlockHandles } from "./BlockHandles";

type BlockNodeFrameProps = {
  badge: string;
  children: ReactNode;
  deleteAriaLabel: string;
  id: string;
  kind: BlockKind;
  selected?: boolean;
  title: string;
  titleAriaLabel: string;
  titlePlaceholder: string;
  variant: string;
  onTitleChange: (next: string) => void;
};

const nameMinWidth = (name: string) => Math.max(440, name.length * 20 + 50);

export const BlockNodeFrame = ({
  badge,
  children,
  deleteAriaLabel,
  id,
  kind,
  selected,
  title,
  titleAriaLabel,
  titlePlaceholder,
  variant,
  onTitleChange,
}: BlockNodeFrameProps) => {
  const ctx = useDiagramContext();
  const [titleLayout, setTitleLayout] = useState(title);
  const handleTitleDraftChange = useCallback((draft: string) => {
    setTitleLayout(draft);
  }, []);

  return (
    <article
      className={`block-node block-node--${variant} block-node--editable${
        selected ? " block-node--editing" : ""
      }`}
      style={{ minWidth: nameMinWidth(titleLayout) }}
    >
      <BlockHandles kind={kind} />

      <header className="block-node__head">
        <span className="block-node__badge">{badge}</span>
        <span className="block-node__head-spacer" />
        <span className="block-node__head-trash">
          <TrashButton
            ariaLabel={deleteAriaLabel}
            onClick={() => ctx.onDeleteNode(id)}
          />
        </span>
      </header>

      <BlockTitleInput
        nodeId={id}
        committedValue={title}
        onCommit={onTitleChange}
        onDraftChange={handleTitleDraftChange}
        aria-label={titleAriaLabel}
        className="block-node__title-input nodrag nowheel"
        emptyClassName="block-node__title-input--placeholder"
        placeholder={titlePlaceholder}
      />

      {children}
    </article>
  );
};
