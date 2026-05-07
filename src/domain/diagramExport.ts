import { z } from "zod";
import { createId } from "./id";
import { deriveResourceSchemas } from "./resourceSchema";
import { formatPsqlColumnType, getRequiredExtension } from "./psqlTypes";
import {
  parsePsqlForeignKeyIndicatorSourceHandleId,
  parsePsqlForeignKeyIndicatorTargetHandleId,
  psqlForeignKeyIndicatorSourceHandleId,
  psqlForeignKeyIndicatorTargetHandleId,
} from "./psqlForeignKeys";
import { remapConnectionEndpointHandle } from "./connectionEndpoints";
import {
  diagramSchema,
  type Diagram,
  type DiagramEdge,
  type DiagramNode,
  type AppViewEvent,
  type PsqlColumn,
  type PsqlEnum,
  type PsqlForeignKey,
  type ResourceSchemaField,
} from "./types";

type PsqlTableDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "psqlTable" }>;
};

type RestResourceDiagramNode = DiagramNode & {
  data: Extract<DiagramNode["data"], { kind: "restResource" }>;
};

type MermaidExportedDiagramNode = RestResourceDiagramNode | PsqlTableDiagramNode;

const isMermaidExportedNode = (
  node: DiagramNode,
): node is MermaidExportedDiagramNode =>
  node.data.kind === "restResource" || node.data.kind === "psqlTable";

const getMermaidDiagramNodes = (diagram: Diagram): MermaidExportedDiagramNode[] =>
  diagram.nodes.filter(isMermaidExportedNode);

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

const remapPsqlIndicatorHandle = (
  handleId: string | null | undefined,
  idMap: Map<string, string>,
) => {
  const columnId = parsePsqlForeignKeyIndicatorSourceHandleId(handleId);
  if (columnId) {
    return psqlForeignKeyIndicatorSourceHandleId(remapValue(columnId, idMap));
  }

  const foreignKeyId = parsePsqlForeignKeyIndicatorTargetHandleId(handleId);
  if (foreignKeyId) {
    return psqlForeignKeyIndicatorTargetHandleId(remapValue(foreignKeyId, idMap));
  }

  return handleId;
};

const remapDiagramHandle = (
  handleId: string | null | undefined,
  idMap: Map<string, string>,
) => {
  const remappedEndpointHandle = remapConnectionEndpointHandle(
    handleId,
    (value) => remapValue(value, idMap),
  );

  return remappedEndpointHandle === handleId
    ? remapPsqlIndicatorHandle(handleId, idMap)
    : remappedEndpointHandle;
};

const cloneAppViewEvents = (
  events: AppViewEvent[],
  idMap: Map<string, string>,
): AppViewEvent[] =>
  events.map((event) => {
    const id = createId("event");
    idMap.set(event.id, id);

    return {
      ...event,
      id,
    };
  });

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

    if (node.data.kind === "appView") {
      return {
        ...node,
        id,
        selected: false,
        data: {
          ...node.data,
          events: cloneAppViewEvents(node.data.events, idMap),
        },
      };
    }

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
      const foreignKeys = node.data.foreignKeys.map((foreignKey) => {
        const id = createId("foreign-key");
        idMap.set(foreignKey.id, id);

        return {
          ...foreignKey,
          id,
          targetTableId: remapValue(foreignKey.targetTableId, idMap),
          targetColumnId: remapValue(foreignKey.targetColumnId, idMap),
        };
      });
      const fieldIds = new Set([
        ...node.data.columns.map((column) => column.id),
        ...foreignKeys.map((foreignKey) => foreignKey.id),
      ]);

      return {
        ...node,
        data: {
          ...node.data,
          primaryKey: node.data.primaryKey
            .map((id) => remapValue(id, idMap))
            .filter((id) => fieldIds.has(id)),
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
          foreignKeys,
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
        sourceHandle: remapDiagramHandle(edge.sourceHandle, idMap),
        target: remapValue(edge.target, idMap),
        targetHandle: remapDiagramHandle(edge.targetHandle, idMap),
      };
    }),
  };
};

const getBlockMermaidName = (node: MermaidExportedDiagramNode) => {
  if (node.data.kind === "restResource") {
    return node.data.resourceName || "resource";
  }

  return node.data.tableName || "psql_table";
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

const createMermaidNodeIdMap = (nodes: MermaidExportedDiagramNode[]) => {
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

  const tableData = node.data;
  const primaryKeys =
    tableData.primaryKey
      .map((id) => tableData.columns.find((c) => c.id === id) ?? null)
      .filter((col): col is PsqlColumn => col !== null)
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
        (column) => column.id === foreignKey.targetColumnId && column.name.trim(),
      );

      if (!targetTable || !targetColumn) {
        return [];
      }

      const actions = [
        foreignKey.onDelete && foreignKey.onDelete !== "NO ACTION"
          ? `ON DELETE ${foreignKey.onDelete}`
          : "",
        foreignKey.onUpdate && foreignKey.onUpdate !== "NO ACTION"
          ? `ON UPDATE ${foreignKey.onUpdate}`
          : "",
      ]
        .filter(Boolean)
        .join("; ");

      return [
        {
          source: node.id,
          target: targetTable.id,
          label: `FK: ${foreignKey.name || "foreign_key"} -> ${
            targetTable.data.tableName || "table"
          }.${targetColumn.name || "column"}${actions ? `; ${actions}` : ""}`,
        },
      ];
    });
  });
};

export const serializeMermaidDiagram = (diagram: Diagram) => {
  const resourceSchemas = deriveResourceSchemas(diagram);
  const nodesForMermaid = getMermaidDiagramNodes(diagram);
  const nodeIdMap = createMermaidNodeIdMap(nodesForMermaid);

  const lines = ["flowchart LR"];

  nodesForMermaid.forEach((node) => {
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

const truncateErText = (value: string, maxLen: number) =>
  value.length <= maxLen ? value : `${value.slice(0, maxLen - 1)}…`;

const formatErAttributeRow = (
  sqlType: string,
  name: string,
  attributeKeys: readonly ("PK" | "FK" | "UK")[],
  commentParts: string[],
) => {
  const keyPart = attributeKeys.length ? ` ${attributeKeys.join(" ")}` : "";
  return `    ${erFieldType(sqlType)} ${erFieldName(name)}${keyPart}${formatErComment(
    commentParts,
  )}`;
};

const formatRestResourceMethodsEr = (node: RestResourceDiagramNode) =>
  node.data.methods
    .map((method) => {
      const inputs =
        method.input
          .map(
            (input) =>
              `${input.name || "input"}:${input.type}${
                input.mode === "query" ? " query" : " body"
              }`,
          )
          .join(", ") || "—";
      return `${method.kind} (${inputs})${method.output.returnsArray ? " → array" : ""}`;
    })
    .join("; ");

const formatResourceFieldSourceErPart = (
  field: ResourceSchemaField,
  tableLookup: Map<string, PsqlTableDiagramNode>,
): string => {
  const table = tableLookup.get(field.sourceTableId);
  const column = table?.data.columns.find((c) => c.id === field.sourceColumnId);
  if (!table?.data.tableName?.trim() || !column?.name?.trim()) {
    return "";
  }
  return `maps ${table.data.tableName}.${column.name}`;
};

const psqlSerialBackingTypes = {
  serial: "integer",
  bigserial: "bigint",
  smallserial: "smallint",
} as const;

const getPsqlSerialBackingType = (type: PsqlColumn["type"]) =>
  type in psqlSerialBackingTypes
    ? psqlSerialBackingTypes[type as keyof typeof psqlSerialBackingTypes]
    : null;

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

const createErEntityIdMap = (nodes: MermaidExportedDiagramNode[]) => {
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
  const nodesForMermaid = getMermaidDiagramNodes(diagram);
  const entityIdMap = createErEntityIdMap(nodesForMermaid);
  const psqlTableById = new Map(
    diagram.nodes
      .filter((n): n is PsqlTableDiagramNode => n.data.kind === "psqlTable")
      .map((n) => [n.id, n]),
  );
  const lines = ["erDiagram"];

  const resolveForeignKeyErSqlType = (foreignKey: PsqlForeignKey) => {
    const targetTable = psqlTableById.get(foreignKey.targetTableId);
    const targetColumn = targetTable?.data.columns.find(
      (c) => c.id === foreignKey.targetColumnId,
    );
    return (
      (targetColumn ? getPsqlSerialBackingType(targetColumn.type) : null) ??
      getPsqlSerialBackingType(foreignKey.type as PsqlColumn["type"]) ??
      foreignKey.type
    );
  };

  const resolvePsqlIndexFieldName = (
    table: PsqlTableDiagramNode,
    fieldId: string,
  ): string | null => {
    const column = table.data.columns.find((c) => c.id === fieldId && c.name.trim());
    if (column) {
      return column.name;
    }
    const fk = table.data.foreignKeys.find((f) => f.id === fieldId && f.name.trim());
    return fk?.name ?? null;
  };

  nodesForMermaid.forEach((node) => {
    const entityId = entityIdMap.get(node.id);

    if (!entityId) {
      return;
    }

    lines.push(`  ${entityId} {`);

    if (node.data.kind === "restResource") {
      const rest = node as RestResourceDiagramNode;
      const path = rest.data.resourceName?.trim().replace(/^\/+/, "") || "";
      lines.push(
        formatErAttributeRow("string", "resource_path", [], [
          path ? `/${path}` : "unnamed resource",
        ]),
      );
      const description = rest.data.description?.trim();
      if (description) {
        lines.push(
          formatErAttributeRow("string", "resource_description", [], [
            truncateErText(description, 240),
          ]),
        );
      }
      const methodsLine = formatRestResourceMethodsEr(rest);
      if (methodsLine) {
        lines.push(
          formatErAttributeRow("string", "http_methods", [], [
            truncateErText(methodsLine, 360),
          ]),
        );
      }

      const schema = getResourceSchema(rest, resourceSchemas);
      if (schema.length === 0) {
        lines.push(`    string resource ${quoteErComment("no schema fields")}`);
      }

      schema.forEach((field) => {
        lines.push(
          formatErAttributeRow(
            formatResourceSchemaFieldType(field, diagram.psqlEnums),
            field.name || "field",
            [],
            [
              field.nullable ? "nullable" : "required",
              field.enum?.length ? `enum: ${field.enum.join(", ")}` : "",
              formatResourceFieldSourceErPart(field, psqlTableById),
              field.description ?? "",
            ],
          ),
        );
      });
    } else if (node.data.kind === "psqlTable") {
      const table = node as PsqlTableDiagramNode;
      const pkColumnIds = new Set(table.data.primaryKey);
      table.data.columns.forEach((column) => {
        if (!column.name.trim()) {
          return;
        }
        const keys: ("PK" | "FK" | "UK")[] = [];
        if (pkColumnIds.has(column.id)) {
          keys.push("PK");
        }
        if (column.unique && !pkColumnIds.has(column.id)) {
          keys.push("UK");
        }
        const defaultExpr = column.defaultValue?.trim();
        const checkExpr = column.check?.trim();
        lines.push(
          formatErAttributeRow(
            formatPsqlColumnType(column, diagram.psqlEnums),
            column.name,
            keys,
            [
              column.nullable ? "nullable" : "required",
              defaultExpr ? `default: ${truncateErText(defaultExpr, 80)}` : "",
              checkExpr ? `check: ${truncateErText(checkExpr, 80)}` : "",
            ],
          ),
        );
      });

      table.data.foreignKeys.forEach((foreignKey) => {
        if (!foreignKey.name.trim()) {
          return;
        }
        const targetTable = psqlTableById.get(foreignKey.targetTableId);
        const targetColumn = targetTable?.data.columns.find(
          (c) => c.id === foreignKey.targetColumnId && c.name.trim(),
        );
        const ref =
          targetTable && targetColumn
            ? `-> ${targetTable.data.tableName || "table"}.${targetColumn.name}`
            : "";
        const actionParts = [
          foreignKey.onDelete && foreignKey.onDelete !== "NO ACTION"
            ? `ON DELETE ${foreignKey.onDelete}`
            : "",
          foreignKey.onUpdate && foreignKey.onUpdate !== "NO ACTION"
            ? `ON UPDATE ${foreignKey.onUpdate}`
            : "",
        ].filter(Boolean);
        const keys: ("PK" | "FK" | "UK")[] = ["FK"];
        if (pkColumnIds.has(foreignKey.id)) {
          keys.unshift("PK");
        }
        lines.push(
          formatErAttributeRow(
            resolveForeignKeyErSqlType(foreignKey),
            foreignKey.name,
            keys,
            [foreignKey.nullable ? "nullable" : "required", ref, ...actionParts],
          ),
        );
      });

      table.data.indices.forEach((index, indexOrdinal) => {
        const columnNames = index.columns
          .map((id) => resolvePsqlIndexFieldName(table, id))
          .filter((name): name is string => Boolean(name));
        if (columnNames.length === 0) {
          return;
        }
        lines.push(
          formatErAttributeRow(
            "string",
            `idx_${indexOrdinal + 1}`,
            [],
            [
              `INDEX ${index.method}${index.unique ? " UNIQUE" : ""} (${columnNames.join(", ")})`,
            ],
          ),
        );
      });
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

/** FK targets that participate in emitted REFERENCES (same rules as `serializePsqlTableDdl`). */
const getEmittedForeignKeyPrerequisiteIds = (
  table: PsqlTableDiagramNode,
  tableLookup: Map<string, PsqlTableDiagramNode>,
  validTableIds: ReadonlySet<string>,
): string[] => {
  const prereqs = new Set<string>();

  for (const foreignKey of table.data.foreignKeys) {
    if (
      !foreignKey.name.trim() ||
      !foreignKey.targetTableId ||
      !foreignKey.targetColumnId
    ) {
      continue;
    }

    if (foreignKey.targetTableId === table.id) {
      continue;
    }

    if (!validTableIds.has(foreignKey.targetTableId)) {
      continue;
    }

    const targetTable = tableLookup.get(foreignKey.targetTableId);
    const targetColumn = targetTable?.data.columns.find(
      (column) => column.id === foreignKey.targetColumnId && column.name.trim(),
    );

    if (targetTable && targetColumn) {
      prereqs.add(targetTable.id);
    }
  }

  return [...prereqs];
};

/**
 * Topological order: referenced tables before referencing tables.
 * Preserves diagram order among unrelated tables; cyclic FK graphs fall back to diagram order.
 */
const sortPsqlTableNodesForDdl = (
  tableNodes: PsqlTableDiagramNode[],
  tableLookup: Map<string, PsqlTableDiagramNode>,
): PsqlTableDiagramNode[] => {
  const validTableIds = new Set(tableNodes.map((node) => node.id));
  const indexById = new Map(tableNodes.map((node, index) => [node.id, index]));

  const indegree = new Map<string, number>();
  const dependentsByPrereq = new Map<string, string[]>();

  for (const node of tableNodes) {
    const prereqs = getEmittedForeignKeyPrerequisiteIds(node, tableLookup, validTableIds);
    indegree.set(node.id, prereqs.length);

    for (const prereqId of prereqs) {
      const list = dependentsByPrereq.get(prereqId);
      if (list) {
        list.push(node.id);
      } else {
        dependentsByPrereq.set(prereqId, [node.id]);
      }
    }
  }

  const takeSmallestIndex = (candidates: string[]): string | undefined => {
    if (candidates.length === 0) {
      return undefined;
    }

    let best = candidates[0];
    let bestIdx = indexById.get(best) ?? 0;

    for (let i = 1; i < candidates.length; i++) {
      const id = candidates[i];
      const idx = indexById.get(id) ?? 0;
      if (idx < bestIdx) {
        best = id;
        bestIdx = idx;
      }
    }

    return best;
  };

  const ready: string[] = [];
  for (const node of tableNodes) {
    if ((indegree.get(node.id) ?? 0) === 0) {
      ready.push(node.id);
    }
  }

  const orderedIds: string[] = [];
  const placed = new Set<string>();

  while (ready.length > 0) {
    const nextId = takeSmallestIndex(ready);
    if (!nextId) {
      break;
    }

    const idx = ready.indexOf(nextId);
    ready.splice(idx, 1);
    orderedIds.push(nextId);
    placed.add(nextId);

    for (const dependentId of dependentsByPrereq.get(nextId) ?? []) {
      const nextDegree = (indegree.get(dependentId) ?? 0) - 1;
      indegree.set(dependentId, nextDegree);

      if (nextDegree === 0) {
        ready.push(dependentId);
      }
    }
  }

  for (const node of tableNodes) {
    if (!placed.has(node.id)) {
      orderedIds.push(node.id);
    }
  }

  const nodeById = new Map(tableNodes.map((node) => [node.id, node]));
  return orderedIds.map((id) => nodeById.get(id)).filter((n): n is PsqlTableDiagramNode => Boolean(n));
};

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
  const getForeignKeyDdlType = (foreignKey: PsqlForeignKey) => {
    const targetTable = tableLookup.get(foreignKey.targetTableId);
    const targetColumn = targetTable?.data.columns.find(
      (column) => column.id === foreignKey.targetColumnId,
    );
    return (
      (targetColumn ? getPsqlSerialBackingType(targetColumn.type) : null) ??
      getPsqlSerialBackingType(foreignKey.type) ??
      foreignKey.type
    );
  };
  const formatColumnConstraints = (column: PsqlColumn) => {
    const defaultExpr = column.defaultValue?.trim();
    const checkExpr = column.check?.trim();
    return [
      column.nullable ? "" : " NOT NULL",
      defaultExpr ? ` DEFAULT ${defaultExpr}` : "",
      column.unique ? " UNIQUE" : "",
      checkExpr ? ` CHECK (${checkExpr})` : "",
    ].join("");
  };

  const columnLines = table.data.columns
    .filter((column) => column.name.trim())
    .map(
      (column) =>
        `  ${quoteSqlIdentifier(column.name, "column")} ${formatPsqlColumnTypeForDdl(
          column,
          diagram,
        )}${formatColumnConstraints(column)}`,
    );
  const foreignKeyColumnLines = table.data.foreignKeys
    .filter((foreignKey) => foreignKey.name.trim())
    .map(
      (foreignKey) =>
        `  ${quoteSqlIdentifier(
          foreignKey.name,
          "foreign_key",
        )} ${getForeignKeyDdlType(foreignKey)}${
          foreignKey.nullable ? "" : " NOT NULL"
        }`,
    );
  const pkIds = new Set(table.data.primaryKey);
  const primaryKeyColumns = table.data.columns.filter(
    (column) => pkIds.has(column.id) && column.name.trim(),
  );
  const primaryKeyForeignKeys = table.data.foreignKeys.filter(
    (fk) => pkIds.has(fk.id) && fk.name.trim(),
  );
  const primaryKeyParts = [
    ...table.data.primaryKey.flatMap((id) => {
      const col = primaryKeyColumns.find((c) => c.id === id);
      if (col) return [quoteSqlIdentifier(col.name, "column")];
      const fk = primaryKeyForeignKeys.find((f) => f.id === id);
      if (fk) return [quoteSqlIdentifier(fk.name, "foreign_key")];
      return [];
    }),
  ];
  const primaryKeyLine = primaryKeyParts.length
    ? [`  PRIMARY KEY (${primaryKeyParts.join(", ")})`]
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

    const onDelete =
      foreignKey.onDelete && foreignKey.onDelete !== "NO ACTION"
        ? ` ON DELETE ${foreignKey.onDelete}`
        : "";
    const onUpdate =
      foreignKey.onUpdate && foreignKey.onUpdate !== "NO ACTION"
        ? ` ON UPDATE ${foreignKey.onUpdate}`
        : "";

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

const quoteIndexColumn = (table: PsqlTableDiagramNode, fieldId: string): string | null => {
  const column = table.data.columns.find((c) => c.id === fieldId && c.name.trim());
  if (column) {
    return quoteSqlIdentifier(column.name, "column");
  }
  const foreignKey = table.data.foreignKeys.find((fk) => fk.id === fieldId && fk.name.trim());
  if (foreignKey) {
    return quoteSqlIdentifier(foreignKey.name, "foreign_key");
  }
  return null;
};

const serializePsqlIndexDdl = (table: PsqlTableDiagramNode) =>
  table.data.indices.flatMap((index) => {
    const quoted = index.columns
      .map((fieldId) => quoteIndexColumn(table, fieldId))
      .filter((part): part is string => part !== null);

    if (quoted.length === 0 || quoted.length !== index.columns.length) {
      return [];
    }

    const tableName = quoteSqlIdentifier(table.data.tableName, "table");
    const method = index.method === "btree" ? "" : ` USING ${index.method}`;

    return [
      `CREATE ${index.unique ? "UNIQUE " : ""}INDEX ON ${tableName}${method} (${quoted.join(
        ", ",
      )});`,
    ];
  });

const serializePsqlDdl = (diagram: Diagram) => {
  const tableLookup = createPsqlTableLookup(diagram);
  const tableNodes = sortPsqlTableNodesForDdl(getPsqlTableNodes(diagram), tableLookup);

  const requiredExtensions = new Set<string>();
  for (const table of tableNodes) {
    for (const column of table.data.columns) {
      const ext = getRequiredExtension(column.type);
      if (ext) requiredExtensions.add(ext);
    }
  }

  const statements = [
    ...[...requiredExtensions].map((ext) => `CREATE EXTENSION IF NOT EXISTS ${ext};`),
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
