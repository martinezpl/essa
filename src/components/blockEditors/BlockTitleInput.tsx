import { useEffect, useState, type InputHTMLAttributes } from "react";

type BlockTitleInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "className"
> & {
  nodeId: string;
  committedValue: string;
  onCommit: (next: string) => void;
  /** Called on every draft change so parents can resize (e.g. minWidth) while typing. */
  onDraftChange?: (draft: string) => void;
  className: string;
  /** Appended while the draft is empty (e.g. placeholder typography). */
  emptyClassName?: string;
};

/**
 * Title fields on diagram blocks: keep text in local state while editing so
 * store/React Flow updates do not run on every keystroke (which resets
 * selection when replacing a range).
 */
export const BlockTitleInput = ({
  nodeId,
  committedValue,
  onCommit,
  onDraftChange,
  onBlur: onBlurProp,
  className,
  emptyClassName,
  ...rest
}: BlockTitleInputProps) => {
  const [draft, setDraft] = useState(committedValue);

  useEffect(() => {
    setDraft(committedValue);
    onDraftChange?.(committedValue);
  }, [committedValue, nodeId]);

  const mergedClassName = [className, draft === "" ? emptyClassName : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <input
      {...rest}
      className={mergedClassName}
      value={draft}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        onDraftChange?.(next);
      }}
      onBlur={(event) => {
        onBlurProp?.(event);
        if (draft !== committedValue) {
          onCommit(draft);
        }
      }}
    />
  );
};
