const PSQL_FOREIGN_KEY_TARGET_HANDLE_PREFIX = "psql-fk-target-";
const PSQL_COLUMN_SOURCE_HANDLE_PREFIX = "psql-column-source-";

export const psqlForeignKeyTargetHandleId = (foreignKeyId: string) =>
  `${PSQL_FOREIGN_KEY_TARGET_HANDLE_PREFIX}${foreignKeyId}`;

export const psqlColumnSourceHandleId = (columnId: string) =>
  `${PSQL_COLUMN_SOURCE_HANDLE_PREFIX}${columnId}`;

export const parsePsqlForeignKeyTargetHandleId = (
  handleId?: string | null,
) =>
  handleId?.startsWith(PSQL_FOREIGN_KEY_TARGET_HANDLE_PREFIX)
    ? handleId.slice(PSQL_FOREIGN_KEY_TARGET_HANDLE_PREFIX.length)
    : null;

export const parsePsqlColumnSourceHandleId = (handleId?: string | null) =>
  handleId?.startsWith(PSQL_COLUMN_SOURCE_HANDLE_PREFIX)
    ? handleId.slice(PSQL_COLUMN_SOURCE_HANDLE_PREFIX.length)
    : null;
