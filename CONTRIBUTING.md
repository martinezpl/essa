# Contributing

## Glossary

- **Diagram**: A single saved canvas containing blocks, edges, PostgreSQL enums, and metadata such as name and timestamps.
- **Block**: Domain behavior for a node kind, such as hydration, cloning, titles, default data, and connection creation.
- **Node**: The React Flow canvas item that positions and renders a block. Nodes persist `id`, `type`, `position`, and block-specific `data`.
- **Edge**: A persisted connection between two nodes. User-created edges store a connection kind, source and target handles, and optional `dataPath` metadata.
- **Connection**: The domain model wrapper around an edge. It validates how endpoints relate and how that relationship exports to Mermaid or other formats.
- **Endpoint**: A connectable input or output defined by `src/domain/connectionEndpoints.ts`. Endpoints are the source of truth for viable sources, targets, handles, labels, and default connection kinds.
- **Handle**: A React Flow attachment point rendered from an endpoint. Handles are implementation details for interaction; endpoint helpers own handle ids and parsing.
- **Indicator handle**: A handle used only to visualize derived relationships. PostgreSQL foreign key handles are indicators, not user-connectable endpoints.
- **App View**: A page or screen block. It has a view name, route, optional description, a default `onLoad` lifecycle output, and user-named event outputs.
- **Resource**: A REST API resource block. It models endpoint methods, service context, query or payload inputs, outputs, and OpenAPI-compatible schema fields.
- **PSQL table**: A PostgreSQL table block. It models columns, foreign keys, indices, and SQL-oriented table metadata.
- **Wildcard**: A block for anything outside the modeled system. It has a name, description, and named children with their own descriptions. Children are descriptive only and are never connectable.
- **Annotation**: A canvas-only note. It is not a connectable block and is not part of generated API or SQL output.

## Codebase Shape

- `src/domain/types.ts` is the persisted schema source of truth. Update it first when changing node, edge, method, table, enum, or diagram data.
- `src/domain/model/index.ts` hydrates persisted nodes into domain blocks and owns connection creation and compatibility delegation.
- `src/domain/connectionEndpoints.ts` defines all user-connectable endpoint handles and endpoint compatibility.
- `src/domain/connectionRules.ts` is the React Flow boundary for validating and creating edges from UI connection events.
- `src/storage/diagramMigrations.ts` evolves persisted `localStorage` data between schema versions.
- `src/components/nodes/*Node.tsx` renders block-specific node UI and endpoint handles.
- `src/components/nodes/ConnectionHandle.tsx` is the shared handle renderer and drag/hover state helper.
- `src/domain/diagramExport.ts` serializes diagrams to `.essa`-compatible data, Markdown, Mermaid, OpenAPI, and PostgreSQL DDL.

## Blocks and Data Conventions

### App Views

App Views represent application pages or screens, not low-level UI components. They model when a page loads and what user-level events can happen on that page.

- Every App View has an `onLoad` output endpoint.
- Events are user-defined outputs. The UI presents event names as two fields separated by a hardcoded `::` convention, such as `Submit::onClick`, while persistence stores a single `name` string.
- App View input endpoints accept navigation from another App View event.
- App View events can connect to REST method inputs or App View inputs.
- The `navigate` connection kind can carry `dataPath` metadata describing data passed to the destination view.

### REST Resources

REST Resources model API resources and method contracts.

- REST methods, not the resource node itself, own connection endpoints.
- Each method has an input endpoint and an output endpoint.
- App View lifecycle and event outputs connect to method input endpoints.
- Method output endpoints connect to PSQL table input endpoints.
- `GET /` and `GET /{id}` default to `read`; mutating methods default to `write`.

### PSQL Tables

PSQL Tables model PostgreSQL storage.

- The table has one user-connectable input endpoint for API method output.
- Columns and foreign keys are edited as table data, not manually connected as user endpoints.
- Foreign key row handles are indicator handles. They may render derived FK edges, but they should not be included in endpoint compatibility.
- Keep SQL-facing behavior in table data and export helpers rather than UI-only state.

### Wildcards

Wildcards model anything outside the modeled system, such as a third-party service or external actor.

- The block has one input endpoint and one output endpoint; both accept a connection to or from any other block kind.
- Children are name/description rows only. They are not connectable and do not own endpoints.
- Because a wildcard endpoint has no method or column context to infer intent from, its connections default to `read/write` and the editor exposes all three connection kinds (`read`, `write`, `read/write`) for the user to pick.
- Wildcards are excluded from OpenAPI export, PostgreSQL DDL export, and both Mermaid diagrams (relationship flowchart and ER diagram), the same way App Views are.

## Connection Conventions

User-created connections should always be endpoint-to-endpoint.

- Define new connectable behavior in `connectionEndpoints.ts` before rendering new handles.
- Use endpoint helper functions for handle ids. Do not duplicate handle string prefixes in components.
- Use parser/remap helpers when cloning, importing, exporting, or duplicating data that references endpoint-owned ids.
- `getCompatibleEndpointConnection()` is the compatibility source of truth for endpoint pairs.
- `DiagramModel.createConnection()` should receive source and target handles for user-created connections.
- Avoid adding new block-level port behavior. The old port concept is legacy; endpoint definitions are the current model.
- Keep connection kinds narrow: `read`, `write`, `read/write`, and `navigate`.
- Use `dataPath` as the persisted metadata field for edge-specific data selection or navigation data unless the schema truly needs a new persisted field.

Current user-connectable endpoint matrix:

- App View `onLoad` output -> REST method input: `read` or `write` based on method kind.
- App View event output -> REST method input: `read` or `write` based on method kind.
- App View event output -> App View input: `navigate`.
- REST method output -> PSQL table input: `read` or `write` based on method kind.
- Wildcard output -> any block input, and any block output -> Wildcard input: `read`, `write`, or `read/write` (no method context to infer from, so the editor lets the user choose).

## UI Conventions

- Node components render their own endpoint handles using `ConnectionHandle`.
- Handles should stay visually quiet until hover or connection drag.
- During connection drag, viable targets should be highlighted and non-viable endpoints should stay subdued.
- Derived FK edges should look different from user-created edges and should use indicator naming in code.
- Edge editing lives in `ConnectionEditor`. Select an edge to update its type or data metadata.
- Keep component-level UI state separate from persisted domain data unless it is required to reload or share a diagram.

## Export Conventions

- `.essa` export should preserve editable diagram state.
- Markdown export currently includes a Mermaid relationship flowchart, Mermaid ER diagram, OpenAPI JSON, and PostgreSQL DDL.
- Keep generated exports deterministic where possible so tests and diffs are meaningful.
- Export code should derive relationships from persisted nodes and edges, not from React component state.

## Persisted Diagram Migrations

Essa stores user diagrams in browser `localStorage`. Because that data belongs to users and may have been saved by older app versions, changes to the persisted diagram schema must be handled through the migration layer.

The latest in-memory diagram shape is defined in `src/domain/types.ts`. The storage boundary lives in `src/storage/diagramStorage.ts`, and versioned migration logic lives in `src/storage/diagramMigrations.ts`.

### When a Migration Is Needed

Add a migration whenever a change affects data that may already exist in `localStorage`, including:

- adding a required field
- renaming or removing a field
- changing a field's type or allowed values
- changing node, edge, block, method, column, index, or foreign key shape
- changing how relationships between diagrams, nodes, or edges are represented

Pure UI changes, derived-only behavior, or optional fields with schema defaults may not need a version bump, but be conservative when user data is involved.

### Migration Workflow

When changing the persisted schema:

1. Add or preserve a schema for the old persisted version in `src/storage/diagramMigrations.ts`.
2. Bump `LATEST_DIAGRAM_COLLECTION_VERSION`.
3. Update the latest `diagramCollectionSchema` version literal in `src/domain/types.ts`.
4. Add a migration function for exactly one version step, such as `migrateV1ToV2`.
5. Wire that function into `migrateDiagramCollection()` so migrations run sequentially.
6. Add tests proving old stored data migrates to the latest shape.
7. Confirm `diagramStorage.ts` reads old `essa.diagrams.vN` keys and writes only to the key derived from the new `LATEST_DIAGRAM_COLLECTION_VERSION`.

### Migration Rules

- Migrations should be pure functions. Do not read or write `localStorage` inside migration helpers.
- `diagramStorage.ts` should remain responsible for storage I/O.
- Validate unknown persisted data before migrating it.
- Validate the migrated result against the latest schema before returning it to the app.
- Do not silently discard user data unless the schema change intentionally removes it.
- Do not overwrite older `localStorage` keys during schema upgrades. A new schema version should write to a new `essa.diagrams.vN` key and leave older keys available as user-data backups.
- Keep migration tests close to the storage layer.

If invalid or unrecoverable data is found, the app may fall back to a fresh starter diagram. That should remain the last resort, not the normal path for schema evolution.
