type HelpModalProps = {
  open: boolean;
  onClose: () => void;
};

export const HelpModal = ({ open, onClose }: HelpModalProps) => {
  if (!open) {
    return null;
  }

  return (
    <div className="help-modal__overlay" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="help-modal-title"
        aria-modal="true"
        className="help-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="help-modal__header">
          <div>
            <span className="eyebrow">How to build Essa diagrams</span>
          </div>
          <button
            aria-label="Close help"
            className="icon-button"
            type="button"
            onClick={onClose}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="help-modal__grid">
          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 5h16v11H8l-4 4V5Z"
                />
                <path strokeLinecap="round" d="M8 9h8M8 13h5" />
              </svg>
            </span>
            <div>
              <h3>Right click to add</h3>
              <p>
                Open the canvas menu anywhere and add an App View, API or PSQL
                Table.
              </p>
            </div>
          </article>

          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 8h10v12H8z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 16H5a1 1 0 0 1-1-1V5h10v1"
                />
              </svg>
            </span>
            <div>
              <h3>Copy and paste blocks</h3>
              <p>
                Select a block, then use <kbd>Ctrl</kbd> + <kbd>C</kbd> and{" "}
                <kbd>Ctrl</kbd> + <kbd>V</kbd>.
              </p>
            </div>
          </article>

          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 7h12M6 12h12M6 17h7"
                />
              </svg>
            </span>
            <div>
              <h3>Model app flow</h3>
              <p>
                Use App Views for pages, API for endpoint methods and tables for
                DB schema.
              </p>
            </div>
          </article>

          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 3h7l5 5v13H7z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 3v5h5M10 14h6M10 17h4"
                />
              </svg>
            </span>
            <div>
              <h3>Connect by intent</h3>
              <p>
                Drag from visible handles to connect events to API methods,
                methods to tables, or events to App Views for navigation.
              </p>
            </div>
          </article>

          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 6l6 6-6 6"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 17V7"
                />
              </svg>
            </span>
            <div>
              <h3>Describe connection data</h3>
              <p>
                Select an edge to edit its type and data. Navigation edges can
                describe data passed to the destination view.
              </p>
            </div>
          </article>

          <article className="help-card">
            <span className="help-card__icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M7 3h7l5 5v13H7z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M14 3v5h5M10 14h6M10 17h4"
                />
              </svg>
            </span>
            <div>
              <h3>Export markdown</h3>
              <p>
                Open the diagram menu to export Markdown with Mermaid
                flowcharts, an ER diagram, OpenAPI JSON, and PostgreSQL DDL.
              </p>
            </div>
          </article>
        </div>

        <div className="help-modal__footer">
          <button type="button" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>
  );
};
