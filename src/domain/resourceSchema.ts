import type {
  Diagram,
  JsonFieldType,
  PsqlColumn,
  PsqlEnum,
  PsqlColumnType,
  ResourceSchemaField,
} from "./types";

const psqlToJsonType: Record<PsqlColumnType, JsonFieldType> = {
  smallint: "integer",
  integer: "integer",
  bigint: "integer",
  serial: "integer",
  bigserial: "integer",
  smallserial: "integer",
  numeric: "number",
  decimal: "number",
  real: "number",
  "double precision": "number",
  money: "number",
  enum: "string",
  text: "string",
  varchar: "string",
  char: "string",
  boolean: "boolean",
  uuid: "string",
  date: "string",
  time: "string",
  timetz: "string",
  timestamp: "string",
  timestamptz: "string",
  interval: "string",
  json: "object",
  jsonb: "object",
  bytea: "string",
  inet: "string",
  cidr: "string",
  macaddr: "string",
  macaddr8: "string",
  bit: "string",
  varbit: "string",
  point: "object",
  line: "object",
  lseg: "object",
  box: "object",
  path: "object",
  polygon: "object",
  circle: "object",
  tsvector: "string",
  tsquery: "string",
  geometry: "object",
  geography: "object",
  "uuid[]": "object",
  "text[]": "object",
  "integer[]": "object",
  "bigint[]": "object",
  "numeric[]": "object",
  "boolean[]": "object",
  "timestamp[]": "object",
  "timestamptz[]": "object",
  "jsonb[]": "object",
};

const isResourceTableEdge = (
  edge: Diagram["edges"][number],
  resourceId: string,
  tableId: string,
) =>
  (edge.source === resourceId && edge.target === tableId) ||
  (edge.source === tableId && edge.target === resourceId);

const getColumnEnumValues = (column: PsqlColumn, psqlEnums: PsqlEnum[]) =>
  column.type === "enum"
    ? psqlEnums.find((psqlEnum) => psqlEnum.id === column.options?.enumId)
        ?.values
    : undefined;

export const deriveResourceSchema = (
  diagram: Diagram,
  resourceId: string,
): ResourceSchemaField[] => {
  const connectedTables = diagram.nodes.filter(
    (node) =>
      node.data.kind === "psqlTable" &&
      diagram.edges.some((edge) =>
        isResourceTableEdge(edge, resourceId, node.id),
      ),
  );

  return connectedTables.flatMap((tableNode) => {
    if (tableNode.data.kind !== "psqlTable") {
      return [];
    }

    return tableNode.data.columns
      .filter((column) => column.name.trim())
      .map((column) => ({
        id: `${tableNode.id}-${column.id}`,
        name: column.name,
        type: psqlToJsonType[column.type],
        ...(getColumnEnumValues(column, diagram.psqlEnums)
          ? { enum: getColumnEnumValues(column, diagram.psqlEnums) }
          : {}),
        nullable: column.nullable,
        sourceTableId: tableNode.id,
        sourceColumnId: column.id,
      }));
  });
};

export const deriveResourceSchemas = (diagram: Diagram) =>
  new Map(
    diagram.nodes
      .filter((node) => node.data.kind === "restResource")
      .map((node) => [node.id, deriveResourceSchema(diagram, node.id)]),
  );

export const getResourceSchemaOptions = (schema: ResourceSchemaField[]) => [
  "all",
  ...schema.map((field) => field.name),
];
