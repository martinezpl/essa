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

    return {
      ...node,
      id,
      selected: false,
      data: {
        ...node.data,
        columns: node.data.columns.map((column) => clonePsqlColumn(column, idMap)),
      },
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
    } else {
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
`;
