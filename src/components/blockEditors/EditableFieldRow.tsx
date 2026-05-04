import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { RowEditPopover } from "./RowEditPopover";

export type EditableFieldRowProps = {
  isEditing: boolean;
  isLinked?: boolean;
  variant?: "default" | "sub";
  /** When nested (e.g. method inputs), stop row activation from toggling the parent method row. */
  stopPointerPropagation?: boolean;
  onOpen: () => void;
  onClose: () => void;
  popover: ReactNode;
  children: ReactNode;
};

export const EditableFieldRow = ({
  isEditing,
  isLinked = false,
  variant = "default",
  stopPointerPropagation = false,
  onOpen,
  onClose,
  popover,
  children,
}: EditableFieldRowProps) => {
  const className = [
    "field-row",
    "nodrag",
    isEditing ? "field-row--active" : "",
    isLinked ? "field-row--linked" : "",
    variant === "sub" ? "field-row--sub" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    if (stopPointerPropagation) {
      event.stopPropagation();
    }
    onOpen();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (stopPointerPropagation) {
        event.stopPropagation();
      }
      onOpen();
    }
  };

  return (
    <div
      className={className}
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {children}
      {isEditing ? (
        <RowEditPopover onClose={onClose}>{popover}</RowEditPopover>
      ) : null}
    </div>
  );
};
