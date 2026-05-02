import type {
  Diagram,
  JsonFieldType,
  PostgresType,
  ResourceSchemaField,
} from "./types";

const postgresToJsonType: Record<PostgresType, JsonFieldType> = {
  uuid: "string",
  text: "string",
  integer: "integer",
  numeric: "number",
  boolean: "boolean",
  timestamp: "string",
  jsonb: "object",
};

const isResourceTableEdge = (
  edge: Diagram["edges"][number],
  resourceId: string,
  tableId: string,
) =>
  (edge.source === resourceId && edge.target === tableId) ||
  (edge.source === tableId && edge.target === resourceId);

export const deriveResourceSchema = (
  diagram: Diagram,
  resourceId: string,
): ResourceSchemaField[] => {
  const connectedTables = diagram.nodes.filter(
    (node) =>
      node.data.kind === "sqlTable" &&
      diagram.edges.some((edge) => isResourceTableEdge(edge, resourceId, node.id)),
  );

  return connectedTables.flatMap((tableNode) => {
    if (tableNode.data.kind !== "sqlTable") {
      return [];
    }

    return tableNode.data.columns
      .filter((column) => column.name.trim())
      .map((column) => ({
        id: `${tableNode.id}-${column.id}`,
        name: column.name,
        type: postgresToJsonType[column.type],
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
