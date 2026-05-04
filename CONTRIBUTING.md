# Contributing

## Glossary

- **Diagram**: A single saved canvas containing blocks, edges, PostgreSQL enums, and metadata such as name and timestamps.
- **Block**: Blocks define behavior for a node kind, such as cloning, exports, compatible ports, and default data.
- **Node**: The React Flow canvas item that positions and renders a block. Nodes persist `id`, `type`, `position`, and block-specific `data`.
- **Edge**: A persisted user-created connection between two nodes. Edges have a connection kind, optional handles, and optional data path metadata.
- **Connection**: The domain model wrapper around an edge. It describes how blocks relate and how that relationship exports to Mermaid or other formats.
- **Port**: A block-level connection capability. Ports define which block kinds can connect and the default connection kind.
- **Handle**: A React Flow attachment point rendered on a node or row. PostgreSQL foreign keys and primary key columns use row-level handles.
- **Resource**: A REST API resource block. It models endpoint methods, service context, query or payload inputs, outputs, and OpenAPI-compatible schema fields.
- **PSQL table**: A PostgreSQL table block. It models columns, foreign keys, indices, and SQL-oriented table metadata.

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
