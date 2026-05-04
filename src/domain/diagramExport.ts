import { z } from "zod";
import { createId } from "./id";
import { deriveResourceSchemas } from "./resourceSchema";
import { formatPsqlColumnType } from "./psqlTypes";
import {
  diagramSchema,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type PsqlColumn,
  type PsqlEnum,
  type ResourceSchemaField,
} from "./types";

type PsqlTableDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

type RestResourceDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "restResource" }>;
};

type OpenApiSchema = {
  type?: string;
  format?: string;
  description?: string;
  enum?: string[];
  nullable?: boolean;
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  items?: OpenApiSchema;
  additionalProperties?: boolean;
};

type OpenApiParameter = {
  name: string;
  in: "query" | "path";
  required: boolean;
  description?: string;
  schema: OpenApiSchema;
};

type OpenApiOperation = {
  summary: string;
  description?: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    required: boolean;
    content: {
      "application/json": {
        schema: OpenApiSchema;
      };
    };
  };
  responses: Record<
    string,
    {
      description: string;
      content?: {
        "application/json": {
          schema: OpenApiSchema;
        };
      };
    }
  >;
};

type OpenApiDocument = {
  openapi: "3.1.0";
  info: {
    title: string;
    version: "1.0.0";
  };
  paths: Record<string, Record<string, OpenApiOperation>>;
};

const ESSA_DIAGRAM_EXPORT_KIND = "essa.diagram";
const ESSA_DIAGRAM_EXPORT_VERSION = 1;

const essaDiagramExportSchema = z.object({
  kind: z.literal(ESSA_DIAGRAM_EXPORT_KIND),
  version: z.literal(ESSA_DIAGRAM_EXPORT_VERSION),
  diagram: diagramSchema,
});

export type EssaDiagramExport = z.infer<typeof essaDiagramExportSchema>;

const nowIso = () => new Date().toISOString();

export const serializeEssaDiagram = (diagram: Diagram) =>
  JSON.stringify(
    {
      kind: ESSA_DIAGRAM_EXPORT_KIND,
      version: ESSA_DIAGRAM_EXPORT_VERSION,
      diagram,
    } satisfies EssaDiagramExport,
    null,
    2,
  );

export const parseEssaDiagram = (rawValue: string): Diagram =>
  essaDiagramExportSchema.parse(JSON.parse(rawValue)).diagram;

const remapValue = (value: string, idMap: Map<string, string>) =>
  idMap.get(value) ?? value;

const cloneResourceSchema = (
  schema: ResourceSchemaField[],
  idMap: Map<string, string>,
): ResourceSchemaField[] =>
  schema.map((field) => {
    const id = createId("schema-field");
    idMap.set(field.id, id);

    return {
      ...field,
      id,
      sourceTableId: remapValue(field.sourceTableId, idMap),
      sourceColumnId: remapValue(field.sourceColumnId, idMap),
    };
  });

const clonePsqlColumn = (
  column: PsqlColumn,
  idMap: Map<string, string>,
): PsqlColumn => {
  const id = createId("column");
  idMap.set(column.id, id);

  return {
    ...column,
    id,
    options: column.options
      ? {
          ...column.options,
          enumId: column.options.enumId
            ? remapValue(column.options.enumId, idMap)
            : column.options.enumId,
        }
      : undefined,
  };
};

const clonePsqlEnums = (
  psqlEnums: PsqlEnum[],
  idMap: Map<string, string>,
): PsqlEnum[] =>
  psqlEnums.map((psqlEnum) => {
    const id = createId("psql-enum");
    idMap.set(psqlEnum.id, id);

    return {
      ...psqlEnum,
      id,
      values: [...psqlEnum.values],
    };
  });

const cloneNodesFirstPass = (
  nodes: DiagramNode[],
  idMap: Map<string, string>,
): DiagramNode[] =>
  nodes.map((node) => {
    const id = createId("node");
    idMap.set(node.id, id);

    if (node.data.kind === "restResource") {
      const methods = node.data.methods.map((method) => {
        const methodId = createId("method");
        idMap.set(method.id, methodId);

        return {
          ...method,
          id: methodId,
          input: method.input.map((input) => {
            const inputId = createId("input");
            idMap.set(input.id, inputId);
            return { ...input, id: inputId };
          }),
        };
      });

      return {
        ...node,
        id,
        selected: false,
        data: {
          ...node.data,
          methods,
        },
      };
    }

    if (node.data.kind === "psqlTable") {
      return {
        ...node,
        id,
        selected: false,
        data: {
          ...node.data,
          columns: node.data.columns.map((column) => clonePsqlColumn(column, idMap)),
        },
      };
    }

    return {
      ...node,
      id,
      selected: false,
    };
  });

const cloneNodesSecondPass = (
  nodes: DiagramNode[],
  idMap: Map<string, string>,
): DiagramNode[] =>
  nodes.map((node) => {
    if (node.data.kind === "restResource") {
      return {
        ...node,
        data: {
          ...node.data,
          schema: cloneResourceSchema(node.data.schema, idMap),
        },
      };
    }

    if (node.data.kind === "psqlTable") {
      return {
        ...node,
        data: {
          ...node.data,
          columns: node.data.columns.map((column) => ({
            ...column,
            options: column.options
              ? {
                  ...column.options,
                  enumId: column.options.enumId
                    ? remapValue(column.options.enumId, idMap)
                    : column.options.enumId,
                }
              : undefined,
          })),
          foreignKeys: node.data.foreignKeys.map((foreignKey) => {
            const id = createId("foreign-key");
            idMap.set(foreignKey.id, id);

            return {
              ...foreignKey,
              id,
              targetTableId: remapValue(foreignKey.targetTableId, idMap),
              targetColumnId: remapValue(foreignKey.targetColumnId, idMap),
            };
          }),
          indices: node.data.indices.map((index) => {
            const id = createId("index");
            idMap.set(index.id, id);

            return {
              ...index,
              id,
              columns: index.columns.map((columnId) => remapValue(columnId, idMap)),
            };
          }),
        },
      };
    }

    return {
      ...node,
    };
  });

export const prepareImportedDiagram = (diagram: Diagram): Diagram => {
  const idMap = new Map<string, string>();
  const id = createId("diagram");
  const timestamp = nowIso();
  idMap.set(diagram.id, id);

  const psqlEnums = clonePsqlEnums(diagram.psqlEnums, idMap);
  const nodes = cloneNodesSecondPass(
    cloneNodesFirstPass(diagram.nodes, idMap),
    idMap,
  );

  return {
    ...diagram,
    id,
    name: diagram.name,
    createdAt: timestamp,
    updatedAt: timestamp,
    psqlEnums,
    nodes,
    edges: diagram.edges.map((edge) => {
      const edgeId = createId("edge");
      idMap.set(edge.id, edgeId);

      return {
        ...edge,
        id: edgeId,
        source: remapValue(edge.source, idMap),
        target: remapValue(edge.target, idMap),
      };
    }),
  };
};

const getBlockMermaidName = (node: DiagramNode) => {
  if (node.data.kind === "restResource") {
    return node.data.resourceName || "resource";
  }

  if (node.data.kind === "psqlTable") {
    return node.data.tableName || "psql_table";
  }

  return node.data.label || "annotation";
};

const sanitizeMermaidId = (value: string) => {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (!sanitized) {
    return "block";
  }

  return /^[a-zA-Z_]/.test(sanitized) ? sanitized : `block_${sanitized}`;
};

const createMermaidNodeIdMap = (nodes: DiagramNode[]) => {
  const usedIds = new Map<string, number>();

  return new Map(
    nodes.map((node) => {
      const baseId = sanitizeMermaidId(getBlockMermaidName(node));
      const usageCount = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, usageCount + 1);

      return [node.id, usageCount === 0 ? baseId : `${baseId}_${usageCount + 1}`];
    }),
  );
};

const escapeMermaidText = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("|", "¦")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

const mermaidLabel = (lines: string[]) =>
  `["${lines.map(escapeMermaidText).join("<br/>")}"]`;

const formatDescription = (description?: string) =>
  description?.trim() ? ` - ${description.trim()}` : "";

const formatRestResourceLabel = (
  node: DiagramNode,
  schema: ResourceSchemaField[],
  psqlEnums: PsqlEnum[],
) => {
  if (node.data.kind !== "restResource") {
    return [];
  }

  const title = node.data.resourceName ? `/${node.data.resourceName}` : "resource";
  const description = node.data.description?.trim() || "none";
  const methods =
    node.data.methods
      .map((method) => {
        const inputs = method.input
          .map(
            (input) =>
              `${input.name || "input"}: ${input.type}${formatDescription(
                input.description,
              )}`,
          )
          .join(", ");
        return `${method.kind}${method.output.returnsArray ? "[]" : ""}${
          inputs ? ` (${inputs})` : ""
        }`;
      })
      .join("; ") || "none";
  const schemaFields =
    schema
      .map(
        (field) =>
          `${field.name}: ${formatResourceSchemaFieldType(
            field,
            psqlEnums,
          )}${formatDescription(field.description)}`,
      )
      .join(", ") || "none";

  return [
    `REST resource: ${title}`,
    `description: ${description}`,
    `methods: ${methods}`,
    `schema: ${schemaFields}`,
  ];
};

const formatPsqlTableLabel = (node: DiagramNode, psqlEnums: PsqlEnum[]) => {
  if (node.data.kind !== "psqlTable") {
    return [];
  }

  const primaryKeys =
    node.data.columns
      .filter((column) => column.primaryKey)
      .map(
        (column) =>
          `${column.name || "column"}: ${formatPsqlColumnType(
          column,
          psqlEnums,
        )}`,
      )
      .join(", ") || "none";

  const foreignKeys =
    node.data.foreignKeys
      .map((foreignKey) => `${foreignKey.name || "foreign_key"}: ${foreignKey.type}`)
      .join(", ") || "none";

  return [
    `PSQL table: ${node.data.tableName || "table"}`,
    `PK: ${primaryKeys}`,
    `FKs: ${foreignKeys}`,
  ];
};

const sameValues = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const formatResourceSchemaFieldType = (
  field: ResourceSchemaField,
  psqlEnums: PsqlEnum[],
) => {
  const enumName = field.enum
    ? psqlEnums.find((item) => sameValues(item.values, field.enum ?? []))?.name
    : undefined;

  return enumName || field.type;
};

const formatNodeLabel = (
  node: DiagramNode,
  schema: ResourceSchemaField[],
  psqlEnums: PsqlEnum[],
) =>
  node.data.kind === "restResource"
    ? formatRestResourceLabel(node, schema, psqlEnums)
    : formatPsqlTableLabel(node, psqlEnums);

const formatEdgeLabel = (edge: DiagramEdge) =>
  `${edge.data.kind}${edge.data.dataPath ? `: ${edge.data.dataPath}` : ""}`;

const getPsqlForeignKeyEdges = (diagram: Diagram) => {
  const psqlTableById = new Map(
    diagram.nodes
      .filter((node): node is PsqlTableDiagramNode => node.data.kind === "psqlTable")
      .map((node) => [node.id, node]),
  );

  return diagram.nodes.flatMap((node) => {
    if (node.data.kind !== "psqlTable") {
      return [];
    }

    return node.data.foreignKeys.flatMap((foreignKey) => {
      if (!foreignKey.targetTableId || !foreignKey.targetColumnId) {
        return [];
      }

      const targetTable = psqlTableById.get(foreignKey.targetTableId);
      const targetColumn = targetTable?.data.columns.find(
        (column) => column.id === foreignKey.targetColumnId && column.primaryKey,
      );

      if (!targetTable || !targetColumn) {
        return [];
      }

      return [
        {
          source: node.id,
          target: targetTable.id,
          label: `FK: ${foreignKey.name || "foreign_key"} -> ${
            targetTable.data.tableName || "table"
          }.${targetColumn.name || "column"}`,
        },
      ];
    });
  });
};

export const serializeMermaidDiagram = (diagram: Diagram) => {
  const resourceSchemas = deriveResourceSchemas(diagram);
  const nodeIdMap = createMermaidNodeIdMap(diagram.nodes);

  const lines = ["flowchart LR"];

  diagram.nodes.forEach((node) => {
    const schema =
      node.data.kind === "restResource" && node.data.schema.length > 0
        ? node.data.schema
        : (resourceSchemas.get(node.id) ?? []);
    const label = mermaidLabel(
      formatNodeLabel(node, schema, diagram.psqlEnums),
    );
    lines.push(`  ${nodeIdMap.get(node.id)}${label}`);
  });

  diagram.edges.forEach((edge) => {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);

    if (!sourceId || !targetId) {
      return;
    }

    lines.push(
      `  ${sourceId} -->|"${escapeMermaidText(formatEdgeLabel(edge))}"| ${targetId}`,
    );
  });

  getPsqlForeignKeyEdges(diagram).forEach((edge) => {
    const sourceId = nodeIdMap.get(edge.source);
    const targetId = nodeIdMap.get(edge.target);

    if (!sourceId || !targetId) {
      return;
    }

    lines.push(`  ${sourceId} -->|"${escapeMermaidText(edge.label)}"| ${targetId}`);
  });

  return `${lines.join("\n")}\n`;
};

const erEntityId = (value: string) => sanitizeMermaidId(value).toUpperCase();

const erFieldName = (value: string) => sanitizeMermaidId(value).toLowerCase();

const erFieldType = (value: string) =>
  sanitizeMermaidId(value.replaceAll("[]", "_array")).toLowerCase();

const quoteErComment = (value: string) =>
  `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;

const formatErComment = (parts: string[]) => {
  const comment = parts.filter(Boolean).join("; ");
  return comment ? ` ${quoteErComment(comment)}` : "";
};

const getResourceSchema = (
  node: DiagramNode,
  resourceSchemas: Map<string, ResourceSchemaField[]>,
) => {
  if (node.data.kind !== "restResource") {
    return [];
  }

  return node.data.schema.length > 0
    ? node.data.schema
    : (resourceSchemas.get(node.id) ?? []);
};

const createErEntityIdMap = (nodes: DiagramNode[]) => {
  const usedIds = new Map<string, number>();

  return new Map(
    nodes.map((node) => {
      const baseId = erEntityId(getBlockMermaidName(node));
      const usageCount = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, usageCount + 1);

      return [node.id, usageCount === 0 ? baseId : `${baseId}_${usageCount + 1}`];
    }),
  );
};

const serializeErDiagram = (diagram: Diagram) => {
  const resourceSchemas = deriveResourceSchemas(diagram);
  const entityIdMap = createErEntityIdMap(diagram.nodes);
  const lines = ["erDiagram"];

  diagram.nodes.forEach((node) => {
    const entityId = entityIdMap.get(node.id);

    if (!entityId) {
      return;
    }

    lines.push(`  ${entityId} {`);

    if (node.data.kind === "restResource") {
      const schema = getResourceSchema(node, resourceSchemas);
      if (schema.length === 0) {
        lines.push(`    string resource ${quoteErComment("resource")}`);
      }

      schema.forEach((field) => {
        lines.push(
          `    ${erFieldType(formatResourceSchemaFieldType(field, diagram.psqlEnums))} ${erFieldName(
            field.name || "field",
          )}${formatErComment([
            field.nullable ? "nullable" : "required",
            field.enum?.length ? `enum: ${field.enum.join(", ")}` : "",
            field.description ?? "",
          ])}`,
        );
      });
    } else if (node.data.kind === "psqlTable") {
      node.data.columns.forEach((column) => {
        lines.push(
          `    ${erFieldType(formatPsqlColumnType(column, diagram.psqlEnums))} ${erFieldName(
            column.name || "column",
          )}${formatErComment([
            column.primaryKey ? "PK" : "",
            column.nullable ? "nullable" : "required",
          ])}`,
        );
      });
    } else {
      lines.push(`    string note ${quoteErComment(getBlockMermaidName(node))}`);
    }

    lines.push("  }");
  });

  diagram.edges.forEach((edge) => {
    const sourceId = entityIdMap.get(edge.source);
    const targetId = entityIdMap.get(edge.target);

    if (!sourceId || !targetId) {
      return;
    }

    lines.push(
      `  ${sourceId} ||--o{ ${targetId} : ${quoteErComment(formatEdgeLabel(edge))}`,
    );
  });

  getPsqlForeignKeyEdges(diagram).forEach((edge) => {
    const sourceId = entityIdMap.get(edge.source);
    const targetId = entityIdMap.get(edge.target);

    if (!sourceId || !targetId) {
      return;
    }

    lines.push(`  ${targetId} ||--o{ ${sourceId} : ${quoteErComment(edge.label)}`);
  });

  return `${lines.join("\n")}\n`;
};

const openApiFormatByType: Partial<Record<ResourceSchemaField["type"], string>> = {
  integer: "int64",
};

const getRestResourceNodes = (diagram: Diagram) =>
  diagram.nodes.filter(
    (node): node is RestResourceDiagramNode => node.data.kind === "restResource",
  );

const getPsqlTableNodes = (diagram: Diagram) =>
  diagram.nodes.filter(
    (node): node is PsqlTableDiagramNode => node.data.kind === "psqlTable",
  );

const normalizeOpenApiResourcePath = (resourceName: string) => {
  const path = resourceName.trim().replace(/^\/+|\/+$/g, "") || "resource";
  return `/${path}`;
};

const getOpenApiMethodPath = (kind: RestResourceDiagramNode["data"]["methods"][number]["kind"]) =>
  kind.endsWith("/{id}") ? "/{id}" : "/";

const getOpenApiMethodName = (
  kind: RestResourceDiagramNode["data"]["methods"][number]["kind"],
) => kind.split(" ")[0].toLowerCase();

const createOpenApiJsonSchema = (
  type: ResourceSchemaField["type"],
  options: {
    description?: string;
    enum?: string[];
    nullable?: boolean;
  } = {},
): OpenApiSchema => ({
  type,
  ...(openApiFormatByType[type] ? { format: openApiFormatByType[type] } : {}),
  ...(options.description?.trim()
    ? { description: options.description.trim() }
    : {}),
  ...(options.enum?.length ? { enum: options.enum } : {}),
  ...(options.nullable ? { nullable: true } : {}),
  ...(type === "object" ? { additionalProperties: true } : {}),
});

const createOpenApiObjectSchema = (fields: ResourceSchemaField[]): OpenApiSchema => {
  if (fields.length === 0) {
    return {
      type: "object",
      additionalProperties: true,
    };
  }

  const properties = Object.fromEntries(
    fields
      .filter((field) => field.name.trim())
      .map((field) => [
        field.name.trim(),
        createOpenApiJsonSchema(field.type, {
          description: field.description,
          enum: field.enum,
          nullable: field.nullable,
        }),
      ]),
  );
  const required = fields
    .filter((field) => field.name.trim() && !field.nullable)
    .map((field) => field.name.trim());

  return {
    type: "object",
    properties,
    ...(required.length ? { required } : {}),
  };
};

const createOpenApiResponseSchema = (
  fields: ResourceSchemaField[],
  returnsArray: boolean,
): OpenApiSchema => {
  const itemSchema = createOpenApiObjectSchema(fields);

  return returnsArray
    ? {
        type: "array",
        items: itemSchema,
      }
    : itemSchema;
};

const createOpenApiRequestSchema = (
  fields: RestResourceDiagramNode["data"]["methods"][number]["input"],
): OpenApiSchema => {
  const payloadFields = fields.filter(
    (field) => field.mode === "payload" && field.name.trim(),
  );
  const properties = Object.fromEntries(
    payloadFields.map((field) => [
      field.name.trim(),
      createOpenApiJsonSchema(field.type, {
        description: field.description,
      }),
    ]),
  );

  return {
    type: "object",
    properties,
    ...(payloadFields.length
      ? { required: payloadFields.map((field) => field.name.trim()) }
      : {}),
  };
};

const createOpenApiParameters = (
  method: RestResourceDiagramNode["data"]["methods"][number],
): OpenApiParameter[] => {
  const parameters: OpenApiParameter[] = [];

  if (method.kind.endsWith("/{id}")) {
    parameters.push({
      name: "id",
      in: "path",
      required: true,
      schema: {
        type: "string",
      },
    });
  }

  method.input
    .filter((field) => field.mode === "query" && field.name.trim())
    .forEach((field) => {
      parameters.push({
        name: field.name.trim(),
        in: "query",
        required: false,
        ...(field.description?.trim()
          ? { description: field.description.trim() }
          : {}),
        schema: createOpenApiJsonSchema(field.type),
      });
    });

  return parameters;
};

const createOpenApiOperation = (
  resource: RestResourceDiagramNode,
  method: RestResourceDiagramNode["data"]["methods"][number],
  schema: ResourceSchemaField[],
): OpenApiOperation => {
  const payloadFields = method.input.filter((field) => field.mode === "payload");
  const responseStatus = method.kind === "POST /" ? "201" : "200";
  const responses: OpenApiOperation["responses"] =
    method.kind === "DELETE /{id}"
      ? {
          "204": {
            description: "No content",
          },
        }
      : {
          [responseStatus]: {
            description: "Success",
            content: {
              "application/json": {
                schema: createOpenApiResponseSchema(
                  schema,
                  method.output.returnsArray,
                ),
              },
            },
          },
        };
  const parameters = createOpenApiParameters(method);

  return {
    summary: method.kind,
    ...(resource.data.description?.trim()
      ? { description: resource.data.description.trim() }
      : {}),
    ...(parameters.length ? { parameters } : {}),
    ...(payloadFields.length
      ? {
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: createOpenApiRequestSchema(method.input),
              },
            },
          },
        }
      : {}),
    responses,
  };
};

const serializeOpenApiDocument = (diagram: Diagram) => {
  const resourceSchemas = deriveResourceSchemas(diagram);
  const paths: OpenApiDocument["paths"] = {};

  getRestResourceNodes(diagram).forEach((resource) => {
    const basePath = normalizeOpenApiResourcePath(resource.data.resourceName);
    const schema =
      resource.data.schema.length > 0
        ? resource.data.schema
        : (resourceSchemas.get(resource.id) ?? []);

    resource.data.methods.forEach((method) => {
      const path = `${basePath}${getOpenApiMethodPath(method.kind)}`.replace(
        /\/$/,
        "",
      );
      paths[path] = {
        ...(paths[path] ?? {}),
        [getOpenApiMethodName(method.kind)]: createOpenApiOperation(
          resource,
          method,
          schema,
        ),
      };
    });
  });

  return JSON.stringify(
    {
      openapi: "3.1.0",
      info: {
        title: escapeMarkdownHeading(diagram.name),
        version: "1.0.0",
      },
      paths,
    } satisfies OpenApiDocument,
    null,
    2,
  );
};

const quoteSqlIdentifier = (value: string, fallback: string) =>
  `"${(value.trim() || fallback).replaceAll('"', '""')}"`;

const quoteSqlLiteral = (value: string) => `'${value.replaceAll("'", "''")}'`;

const getPsqlEnum = (diagram: Diagram, enumId?: string) =>
  diagram.psqlEnums.find((psqlEnum) => psqlEnum.id === enumId);

const formatPsqlColumnTypeForDdl = (column: PsqlColumn, diagram: Diagram) => {
  if (column.type === "enum") {
    const psqlEnum = getPsqlEnum(diagram, column.options?.enumId);
    return quoteSqlIdentifier(psqlEnum?.name ?? "", "enum");
  }

  return formatPsqlColumnType(column, diagram.psqlEnums);
};

const createPsqlTableLookup = (diagram: Diagram) =>
  new Map(getPsqlTableNodes(diagram).map((node) => [node.id, node]));

const serializePsqlEnumDdl = (diagram: Diagram) => {
  const usedEnumIds = new Set(
    getPsqlTableNodes(diagram).flatMap((node) =>
      node.data.columns
        .filter((column) => column.type === "enum" && column.options?.enumId)
        .map((column) => column.options?.enumId ?? ""),
    ),
  );

  return diagram.psqlEnums
    .filter((psqlEnum) => usedEnumIds.has(psqlEnum.id))
    .map(
      (psqlEnum) =>
        `CREATE TYPE ${quoteSqlIdentifier(
          psqlEnum.name,
          "enum",
        )} AS ENUM (${psqlEnum.values.map(quoteSqlLiteral).join(", ")});`,
    );
};

const serializePsqlTableDdl = (
  table: PsqlTableDiagramNode,
  diagram: Diagram,
  tableLookup: Map<string, PsqlTableDiagramNode>,
) => {
  const tableName = quoteSqlIdentifier(table.data.tableName, "table");
  const columnLines = table.data.columns
    .filter((column) => column.name.trim())
    .map(
      (column) =>
        `  ${quoteSqlIdentifier(column.name, "column")} ${formatPsqlColumnTypeForDdl(
          column,
          diagram,
        )}${column.nullable ? "" : " NOT NULL"}`,
    );
  const foreignKeyColumnLines = table.data.foreignKeys
    .filter((foreignKey) => foreignKey.name.trim())
    .map(
      (foreignKey) =>
        `  ${quoteSqlIdentifier(foreignKey.name, "foreign_key")} ${foreignKey.type}${
          foreignKey.nullable ? "" : " NOT NULL"
        }`,
    );
  const primaryKeyColumns = table.data.columns.filter(
    (column) => column.primaryKey && column.name.trim(),
  );
  const primaryKeyLine = primaryKeyColumns.length
    ? [
        `  PRIMARY KEY (${primaryKeyColumns
          .map((column) => quoteSqlIdentifier(column.name, "column"))
          .join(", ")})`,
      ]
    : [];
  const foreignKeyConstraintLines = table.data.foreignKeys.flatMap((foreignKey) => {
    if (
      !foreignKey.name.trim() ||
      !foreignKey.targetTableId ||
      !foreignKey.targetColumnId
    ) {
      return [];
    }

    const targetTable = tableLookup.get(foreignKey.targetTableId);
    const targetColumn = targetTable?.data.columns.find(
      (column) => column.id === foreignKey.targetColumnId && column.name.trim(),
    );

    if (!targetTable || !targetColumn) {
      return [];
    }

    const onDelete = foreignKey.onDelete ? ` ON DELETE ${foreignKey.onDelete}` : "";
    const onUpdate = foreignKey.onUpdate ? ` ON UPDATE ${foreignKey.onUpdate}` : "";

    return [
      `  FOREIGN KEY (${quoteSqlIdentifier(
        foreignKey.name,
        "foreign_key",
      )}) REFERENCES ${quoteSqlIdentifier(
        targetTable.data.tableName,
        "table",
      )} (${quoteSqlIdentifier(targetColumn.name, "column")})${onDelete}${onUpdate}`,
    ];
  });
  const definitionLines = [
    ...columnLines,
    ...foreignKeyColumnLines,
    ...primaryKeyLine,
    ...foreignKeyConstraintLines,
  ];

  if (definitionLines.length === 0) {
    return `CREATE TABLE ${tableName} ();`;
  }

  return `CREATE TABLE ${tableName} (\n${definitionLines.join(",\n")}\n);`;
};

const serializePsqlIndexDdl = (table: PsqlTableDiagramNode) =>
  table.data.indices.flatMap((index) => {
    const columns = index.columns
      .map((columnId) =>
        table.data.columns.find((column) => column.id === columnId && column.name.trim()),
      )
      .filter((column): column is PsqlColumn => Boolean(column));

    if (columns.length === 0) {
      return [];
    }

    return [
      `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quoteSqlIdentifier(
        index.name,
        "index",
      )} ON ${quoteSqlIdentifier(table.data.tableName, "table")}${
        index.method === "btree" ? "" : ` USING ${index.method}`
      } (${columns
        .map((column) => quoteSqlIdentifier(column.name, "column"))
        .join(", ")});`,
    ];
  });

const serializePsqlDdl = (diagram: Diagram) => {
  const tableLookup = createPsqlTableLookup(diagram);
  const tableNodes = getPsqlTableNodes(diagram);
  const statements = [
    ...serializePsqlEnumDdl(diagram),
    ...tableNodes.map((table) => serializePsqlTableDdl(table, diagram, tableLookup)),
    ...tableNodes.flatMap(serializePsqlIndexDdl),
  ];

  return statements.length ? `${statements.join("\n\n")}\n` : "-- No PostgreSQL tables.";
};

const escapeMarkdownHeading = (value: string) =>
  value.replace(/^[#\s]+/, "").trim() || "Diagram";

export const serializeMarkdownDiagram = (diagram: Diagram) => `# ${escapeMarkdownHeading(
  diagram.name,
)}

## Relationship Flowchart

\`\`\`mermaid
${serializeMermaidDiagram(diagram)}\`\`\`

## ER Diagram

\`\`\`mermaid
${serializeErDiagram(diagram)}\`\`\`

## OpenAPI

\`\`\`json
${serializeOpenApiDocument(diagram)}
\`\`\`

## PostgreSQL Schema

\`\`\`sql
${serializePsqlDdl(diagram)}\`\`\`
`;
