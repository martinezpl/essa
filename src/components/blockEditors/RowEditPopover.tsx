import { useEffect, useRef, type ReactNode } from "react";

type RowEditPopoverProps = {
  onClose: () => void;
  children: ReactNode;
};

export const RowEditPopover = ({ onClose, children }: RowEditPopoverProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!ref.current) return;
      if (event.target instanceof Node && ref.current.contains(event.target)) {
        return;
      }
      onClose();
    };

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown, true);
    window.addEventListener("keydown", handleKey);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown, true);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="row-popover nodrag nowheel"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
};
