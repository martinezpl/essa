import type { Diagram } from "../domain/types";

type DiagramSidebarProps = {
  activeDiagramId: string;
  diagrams: Diagram[];
  onCreateDiagram: () => void;
  onDeleteDiagram: (diagramId: string) => void;
  onRenameDiagram: (diagramId: string, name: string) => void;
  onSelectDiagram: (diagramId: string) => void;
};

export const DiagramSidebar = ({
  activeDiagramId,
  diagrams,
  onCreateDiagram,
  onDeleteDiagram,
  onRenameDiagram,
  onSelectDiagram,
}: DiagramSidebarProps) => (
  <aside className="sidebar">
    <div className="sidebar__header">
      <div>
        <span className="eyebrow">Diagrams</span>
        <h1>Essa</h1>
      </div>
      <button type="button" onClick={onCreateDiagram}>
        New
      </button>
    </div>

    <div className="diagram-list">
      {diagrams.map((diagram) => (
        <div
          className={`diagram-card ${
            diagram.id === activeDiagramId ? "diagram-card--active" : ""
          }`}
          key={diagram.id}
        >
          <button
            className="diagram-card__select"
            type="button"
            onClick={() => onSelectDiagram(diagram.id)}
          >
            <strong>{diagram.name}</strong>
            <span>{diagram.nodes.length} blocks</span>
          </button>
          <input
            aria-label={`Rename ${diagram.name}`}
            value={diagram.name}
            onChange={(event) => onRenameDiagram(diagram.id, event.target.value)}
          />
          <button
            className="button-ghost"
            type="button"
            onClick={() => onDeleteDiagram(diagram.id)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  </aside>
);
