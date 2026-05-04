import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

type RowEditPopoverProps = {
  onClose: () => void;
  children: ReactNode;
};

const focusFirstFormField = (root: HTMLElement) => {
  const fields = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input, select, textarea",
  );

  for (const el of fields) {
    if (el.disabled) continue;
    if (el.type === "hidden") continue;
    if (el.hasAttribute("hidden")) continue;
    el.focus();
    return;
  }
};

export const RowEditPopover = ({ onClose, children }: RowEditPopoverProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;

    const run = () => {
      focusFirstFormField(root);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, []);

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
