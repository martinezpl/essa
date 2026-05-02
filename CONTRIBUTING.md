# Contributing

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

### Migration Rules

- Migrations should be pure functions. Do not read or write `localStorage` inside migration helpers.
- `diagramStorage.ts` should remain responsible for storage I/O.
- Validate unknown persisted data before migrating it.
- Validate the migrated result against the latest schema before returning it to the app.
- Do not silently discard user data unless the schema change intentionally removes it.
- Keep migration tests close to the storage layer.

If invalid or unrecoverable data is found, the app may fall back to a fresh starter diagram. That should remain the last resort, not the normal path for schema evolution.
