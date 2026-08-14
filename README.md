# Essa ![](public/logo-mini.png)

Essa is a model-first diagramming tool for sketching application behavior across pages, APIs, and PostgreSQL storage.

## What You Can Model

Essa diagrams are built from a few high-signal blocks:

- **App Views** represent pages or screens. Every view has an **on load** lifecycle, plus user-named events such as `SubmitButton::onClick` that map to API methods or other views.
- **API Resources** define methods, inputs, and response schemas.
- **PSQL Tables** define PostgreSQL tables, columns, enums, indexes, and foreign keys.
- **Wildcards** represent anything outside the modeled system, such as a third-party service. A wildcard has a name, a description, and named child items for its sub-parts; children are descriptive only and cannot connect to anything.
- **Annotations** let you add freeform notes directly to the canvas.

## Connections

Connections describe intent rather than only drawing lines:

- App View events and lifecycles can connect to REST methods for `read`, `write`, or `read/write` data flow.
- App View events can connect to other App Views with `navigate` edges.
- REST methods can connect to PSQL tables to describe table reads and writes.
- Wildcards can connect to and from any other block, in either direction, as `read`, `write`, or `read/write`.
- Navigation edges include a data field for describing what is passed to the destination view.
- PSQL field-level foreign key edges are generated indicators, not user-created connection handles.

Handles stay out of the way until you hover a block or start a connection. While dragging, viable targets are highlighted.

## Exports

Use the diagram export menu to save:

- `.essa` files for preserving and sharing the editable diagram.
- `.md` files containing a Mermaid relationship flowchart, Mermaid ER diagram, OpenAPI JSON, and PostgreSQL DDL.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm run build
npm run lint
npm run test
```
