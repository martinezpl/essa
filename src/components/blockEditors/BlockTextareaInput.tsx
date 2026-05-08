import { useEffect, useState, type TextareaHTMLAttributes } from "react";

type BlockTextareaInputProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange"
> & {
  nodeId: string;
  committedValue: string;
  onCommit: (next: string) => void;
};

/**
 * Keep textarea edits local until blur so typing does not trigger full diagram
 * store writes on each keypress.
 */
export const BlockTextareaInput = ({
  nodeId,
  committedValue,
  onCommit,
  onBlur: onBlurProp,
  ...rest
}: BlockTextareaInputProps) => {
  const [draft, setDraft] = useState(committedValue);

  useEffect(() => {
    setDraft(committedValue);
  }, [committedValue, nodeId]);

  return (
    <textarea
      {...rest}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
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
