const PSQL_FOREIGN_KEY_SOURCE_HANDLE_PREFIX = "psql-fk-source-";
const PSQL_COLUMN_TARGET_HANDLE_PREFIX = "psql-column-target-";

export const psqlForeignKeySourceHandleId = (foreignKeyId: string) =>
  `${PSQL_FOREIGN_KEY_SOURCE_HANDLE_PREFIX}${foreignKeyId}`;

export const psqlColumnTargetHandleId = (columnId: string) =>
  `${PSQL_COLUMN_TARGET_HANDLE_PREFIX}${columnId}`;

export const parsePsqlForeignKeySourceHandleId = (
  handleId?: string | null,
) =>
  handleId?.startsWith(PSQL_FOREIGN_KEY_SOURCE_HANDLE_PREFIX)
    ? handleId.slice(PSQL_FOREIGN_KEY_SOURCE_HANDLE_PREFIX.length)
    : null;

export const parsePsqlColumnTargetHandleId = (handleId?: string | null) =>
  handleId?.startsWith(PSQL_COLUMN_TARGET_HANDLE_PREFIX)
    ? handleId.slice(PSQL_COLUMN_TARGET_HANDLE_PREFIX.length)
    : null;
