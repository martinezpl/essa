import { useEffect, useRef, useState } from "react";
import { countDiagramConnections } from "../domain/diagramStats";
import type { Diagram } from "../domain/types";

type DiagramSidebarProps = {
  activeDiagramId: string;
  diagrams: Diagram[];
  open: boolean;
  onClose: () => void;
  onCreateDiagram: () => void;
  onDeleteDiagram: (diagramId: string) => void;
  onRenameDiagram: (diagramId: string, name: string) => void;
  onSelectDiagram: (diagramId: string) => void;
};

export const DiagramSidebar = ({
  activeDiagramId,
  diagrams,
  open,
  onClose,
  onCreateDiagram,
  onDeleteDiagram,
  onRenameDiagram,
  onSelectDiagram,
}: DiagramSidebarProps) => {
  const drawerRef = useRef<HTMLElement | null>(null);
  const canceledRenameIds = useRef(new Set<string>());
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  const commitDiagramName = (diagram: Diagram) => {
    if (canceledRenameIds.current.has(diagram.id)) {
      canceledRenameIds.current.delete(diagram.id);
      return;
    }

    const draftName = draftNames[diagram.id];

    if (draftName === undefined) {
      return;
    }

    onRenameDiagram(diagram.id, draftName);
    setDraftNames((current) => {
      const next = { ...current };
      delete next[diagram.id];
      return next;
    });
  };

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKey);

    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <>
      <div
        className={`drawer-overlay${open ? " drawer-overlay--open" : ""}`}
        onClick={onClose}
        aria-hidden
      />
      <aside
        ref={drawerRef}
        aria-hidden={!open}
        aria-label="Diagrams"
        className={`drawer${open ? " drawer--open" : ""}`}
      >
        <div className="drawer__header">
          <div className="drawer__brand">
            <span className="eyebrow">Workspace</span>
            <h1>essa</h1>
          </div>
          <button
            aria-label="Close diagrams"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="drawer__body">
          <button
            className="drawer__new"
            type="button"
            onClick={onCreateDiagram}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            New diagram
          </button>

          {diagrams.map((diagram) => {
            const active = diagram.id === activeDiagramId;
            const linkCount = countDiagramConnections(diagram);

            return (
              <div
                className={`diagram-card${active ? " diagram-card--active" : ""}`}
                key={diagram.id}
                onClick={() => onSelectDiagram(diagram.id)}
              >
                <div className="diagram-card__details">
                  <input
                    aria-label={`Rename ${diagram.name}`}
                    className="diagram-card__name-input"
                    value={draftNames[diagram.id] ?? diagram.name}
                    onBlur={() => commitDiagramName(diagram)}
                    onChange={(event) =>
                      setDraftNames((current) => ({
                        ...current,
                        [diagram.id]: event.target.value,
                      }))
                    }
                    onFocus={() => onSelectDiagram(diagram.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }

                      if (event.key === "Escape") {
                        canceledRenameIds.current.add(diagram.id);
                        setDraftNames((current) => {
                          const next = { ...current };
                          delete next[diagram.id];
                          return next;
                        });
                        event.currentTarget.blur();
                      }
                    }}
                  />
                  <span className="diagram-card__meta">
                    {diagram.nodes.length}{" "}
                    {diagram.nodes.length === 1 ? "block" : "blocks"} ·{" "}
                    {linkCount} {linkCount === 1 ? "link" : "links"}
                  </span>
                </div>
                <button
                  aria-label={`Delete ${diagram.name}`}
                  className="diagram-card__delete"
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteDiagram(diagram.id);
                  }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" width="14" height="14">
                    <path strokeLinecap="round" d="M4 7h16M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      </aside>
    </>
  );
};
