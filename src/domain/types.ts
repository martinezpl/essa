import { z } from "zod";
import type { Edge, Node } from "@xyflow/react";

export const blockKindSchema = z.enum(["appView", "restResource", "sqlTable"]);
export type BlockKind = z.infer<typeof blockKindSchema>;

export const restMethodKindSchema = z.enum([
  "POST /",
  "GET /",
  "GET /{id}",
  "PATCH /{id}",
  "DELETE /{id}",
]);
export type RestMethodKind = z.infer<typeof restMethodKindSchema>;
export type RestMethod = RestMethodKind;

export const methodFieldSelectionSchema = z.array(z.string()).default(["all"]);

export const restMethodInputSchema = z.object({
  mode: z.enum(["payload", "query"]),
  fields: methodFieldSelectionSchema,
});
export type RestMethodInput = z.infer<typeof restMethodInputSchema>;

export const restMethodOutputSchema = z.object({
  fields: methodFieldSelectionSchema,
  returnsArray: z.boolean(),
});
export type RestMethodOutput = z.infer<typeof restMethodOutputSchema>;

const restMethodContractBaseSchema = z.object({
  id: z.string().min(1),
  kind: restMethodKindSchema,
  input: restMethodInputSchema.optional(),
  output: restMethodOutputSchema,
});

const defaultMethodContract = (kind: RestMethodKind) => ({
  id: `method-${kind}`,
  kind,
  input:
    kind === "POST /" || kind === "PATCH /{id}"
      ? { mode: "payload" as const, fields: ["all"] }
      : kind === "GET /"
        ? { mode: "query" as const, fields: [] }
        : undefined,
  output: {
    fields: kind === "DELETE /{id}" ? [] : ["all"],
    returnsArray: kind === "GET /",
  },
});

export const restResourceMethodSchema = z.union([
  restMethodKindSchema.transform((kind) => defaultMethodContract(kind)),
  restMethodContractBaseSchema,
]);
export type RestResourceMethod = z.infer<typeof restResourceMethodSchema>;

export const postgresTypeSchema = z.enum([
  "uuid",
  "text",
  "integer",
  "numeric",
  "boolean",
  "timestamp",
  "jsonb",
]);
export type PostgresType = z.infer<typeof postgresTypeSchema>;

export const dataUsageSchema = z.object({
  resourceId: z.string(),
  operation: z.enum(["read", "write"]),
  dataPath: z.string().default("all"),
});
export type ComponentDataUsage = z.infer<typeof dataUsageSchema>;

export const appViewComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  dataUsage: dataUsageSchema.optional(),
});
export type AppViewComponent = z.infer<typeof appViewComponentSchema>;

export const appViewDataSchema = z.object({
  kind: z.literal("appView"),
  route: z.string(),
  components: z.array(appViewComponentSchema),
});
export type AppViewData = z.infer<typeof appViewDataSchema> & Record<string, unknown>;

export const jsonFieldTypeSchema = z.enum([
  "string",
  "integer",
  "number",
  "boolean",
  "object",
]);
export type JsonFieldType = z.infer<typeof jsonFieldTypeSchema>;

export const resourceSchemaFieldSchema = z.object({
  id: z.string().default(""),
  name: z.string(),
  type: jsonFieldTypeSchema,
  nullable: z.boolean(),
  sourceTableId: z.string(),
  sourceColumnId: z.string(),
});
export type ResourceSchemaField = z.infer<typeof resourceSchemaFieldSchema>;

export const restResourceDataSchema = z.object({
  kind: z.literal("restResource"),
  resourceName: z.string(),
  methods: z.array(restResourceMethodSchema),
  schema: z.array(resourceSchemaFieldSchema).default([]),
});
export type RestResourceData = z.infer<typeof restResourceDataSchema> & Record<string, unknown>;

export const sqlColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: postgresTypeSchema,
  nullable: z.boolean(),
  primaryKey: z.boolean(),
});
export type SqlColumn = z.infer<typeof sqlColumnSchema>;

export const sqlIndexSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  columns: z.array(z.string().min(1)).min(1),
  unique: z.boolean(),
});
export type SqlIndex = z.infer<typeof sqlIndexSchema>;

export const sqlTableDataSchema = z.object({
  kind: z.literal("sqlTable"),
  tableName: z.string(),
  columns: z.array(sqlColumnSchema),
  indices: z.array(sqlIndexSchema),
});
export type SqlTableData = z.infer<typeof sqlTableDataSchema> & Record<string, unknown>;

export const blockDataSchema = z.discriminatedUnion("kind", [
  appViewDataSchema,
  restResourceDataSchema,
  sqlTableDataSchema,
]);
export type BlockData = z.infer<typeof blockDataSchema> & Record<string, unknown>;

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  type: blockKindSchema,
  position: positionSchema,
  data: blockDataSchema,
  selected: z.boolean().optional(),
});
export type DiagramNode = z.infer<typeof diagramNodeSchema>;
export type EssaNode = Node<BlockData, BlockKind>;

export const connectionKindSchema = z.enum(["read", "write"]);
export type ConnectionKind = z.infer<typeof connectionKindSchema>;

const legacyConnectionKindSchema = z.enum([
  "viewUsesResource",
  "resourceReadsWritesTable",
  "tableBacksResource",
]);

export const edgeDataSchema = z.object({
  kind: z
    .union([connectionKindSchema, legacyConnectionKindSchema])
    .transform((kind): ConnectionKind => {
      if (kind === "tableBacksResource") {
        return "write";
      }

      if (kind === "read" || kind === "write") {
        return kind;
      }

      return "read";
    }),
  dataPath: z.string().default("all"),
});
export type EdgeData = z.infer<typeof edgeDataSchema> & Record<string, unknown>;

export const diagramEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().optional(),
  data: edgeDataSchema,
});
export type DiagramEdge = z.infer<typeof diagramEdgeSchema>;
export type EssaEdge = Edge<EdgeData>;

export const diagramSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
});
export type Diagram = z.infer<typeof diagramSchema>;

export const diagramCollectionSchema = z.object({
  version: z.literal(1),
  activeDiagramId: z.string().min(1),
  diagrams: z.array(diagramSchema).min(1),
});
export type DiagramCollection = z.infer<typeof diagramCollectionSchema>;
