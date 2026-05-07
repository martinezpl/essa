import { z } from "zod";
import type { Edge, Node } from "@xyflow/react";

export const blockNodeKindSchema = z.enum([
  "appView",
  "restResource",
  "psqlTable",
]);
export type BlockNodeKind = z.infer<typeof blockNodeKindSchema>;
export type BlockKind = BlockNodeKind;

export const canvasNodeKindSchema = z.enum([
  ...blockNodeKindSchema.options,
  "annotation",
]);
export type CanvasNodeKind = z.infer<typeof canvasNodeKindSchema>;

export const restMethodKindSchema = z.enum([
  "POST /",
  "GET /",
  "GET /{id}",
  "PATCH /{id}",
  "DELETE /{id}",
]);
export type RestMethodKind = z.infer<typeof restMethodKindSchema>;
export type RestMethod = RestMethodKind;

export type Field = {
  id: string;
  name: string;
};

export const jsonFieldTypeSchema = z.enum([
  "string",
  "integer",
  "number",
  "boolean",
  "object",
]);
export type JsonFieldType = z.infer<typeof jsonFieldTypeSchema>;

const restMethodInputBaseSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
});

export const restMethodInputFieldSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;

    const input = value as Record<string, unknown>;

    if (input.mode !== "query") {
      return value;
    }

    return {
      ...input,
      type: "string",
    };
  },
  z.discriminatedUnion("mode", [
    restMethodInputBaseSchema.extend({
      mode: z.literal("payload"),
      type: jsonFieldTypeSchema,
    }),
    restMethodInputBaseSchema.extend({
      mode: z.literal("query"),
      type: z.literal("string"),
    }),
  ]),
);
export type RestMethodInputField = z.infer<typeof restMethodInputFieldSchema>;

const restMethodInputArraySchema = z.preprocess((value) => {
  if (Array.isArray(value)) return value;
  return [];
}, z.array(restMethodInputFieldSchema));

export const restMethodOutputSchema = z.preprocess(
  (value) => {
    if (value && typeof value === "object" && "returnsArray" in value) {
      return {
        returnsArray: Boolean(
          (value as { returnsArray?: unknown }).returnsArray,
        ),
      };
    }

    return { returnsArray: false };
  },
  z.object({ returnsArray: z.boolean() }),
);
export type RestMethodOutput = z.infer<typeof restMethodOutputSchema>;

const restMethodContractBaseSchema = z.object({
  id: z.string().min(1),
  kind: restMethodKindSchema,
  input: restMethodInputArraySchema,
  output: restMethodOutputSchema,
});

const defaultMethodContract = (kind: RestMethodKind) => ({
  id: `method-${kind}`,
  kind,
  input: [] as RestMethodInputField[],
  output: { returnsArray: kind === "GET /" },
});

export const restResourceMethodSchema = z.union([
  restMethodKindSchema.transform((kind) => defaultMethodContract(kind)),
  restMethodContractBaseSchema,
]);
export type RestResourceMethod = z.infer<typeof restResourceMethodSchema>;

export const psqlColumnTypeSchema = z.enum([
  "smallint",
  "integer",
  "bigint",
  "serial",
  "bigserial",
  "smallserial",
  "numeric",
  "decimal",
  "real",
  "double precision",
  "money",
  "enum",
  "text",
  "varchar",
  "char",
  "boolean",
  "uuid",
  "date",
  "time",
  "timetz",
  "timestamp",
  "timestamptz",
  "interval",
  "json",
  "jsonb",
  "bytea",
  "inet",
  "cidr",
  "macaddr",
  "macaddr8",
  "bit",
  "varbit",
  "point",
  "line",
  "lseg",
  "box",
  "path",
  "polygon",
  "circle",
  "tsvector",
  "tsquery",
  "geometry",
  "geography",
  "uuid[]",
  "text[]",
  "integer[]",
  "bigint[]",
  "numeric[]",
  "boolean[]",
  "timestamp[]",
  "timestamptz[]",
  "jsonb[]",
]);
export type PsqlColumnType = z.infer<typeof psqlColumnTypeSchema>;

export const psqlColumnOptionsSchema = z.object({
  length: z.number().int().positive().optional(),
  precision: z.number().int().nonnegative().optional(),
  scale: z.number().int().nonnegative().optional(),
  arrayItemType: psqlColumnTypeSchema.optional(),
  enumId: z.string().optional(),
  geometrySubtype: z.string().optional(),
  srid: z.number().int().positive().optional(),
});
export type PsqlColumnOptions = z.infer<typeof psqlColumnOptionsSchema>;

export const psqlEnumSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  values: z.array(z.string()),
});
export type PsqlEnum = z.infer<typeof psqlEnumSchema>;

export const resourceSchemaFieldSchema = z.object({
  id: z.string().default(""),
  name: z.string(),
  type: jsonFieldTypeSchema,
  enum: z.array(z.string()).optional(),
  nullable: z.boolean(),
  sourceTableId: z.string(),
  sourceColumnId: z.string(),
  description: z.string().optional(),
});
export type ResourceSchemaField = z.infer<typeof resourceSchemaFieldSchema>;

export const restResourceDataSchema = z.object({
  kind: z.literal("restResource"),
  resourceName: z.string(),
  description: z.string().optional(),
  methods: z.array(restResourceMethodSchema),
  schema: z.array(resourceSchemaFieldSchema).default([]),
});
export type RestResourceData = z.infer<typeof restResourceDataSchema> &
  Record<string, unknown>;

export const appViewEventSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  description: z.string().optional(),
});
export type AppViewEvent = z.infer<typeof appViewEventSchema>;

export const appViewDataSchema = z.object({
  kind: z.literal("appView"),
  viewName: z.string(),
  route: z.string(),
  description: z.string().optional(),
  events: z.array(appViewEventSchema).default([]),
});
export type AppViewData = z.infer<typeof appViewDataSchema> &
  Record<string, unknown>;

export const psqlColumnSchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;
    const v = value as Record<string, unknown>;
    const next = { ...v };
    if (next.defaultValue === "") delete next.defaultValue;
    if (next.check === "") delete next.check;
    return next;
  },
  z.object({
    id: z.string().min(1),
    name: z.string(),
    type: psqlColumnTypeSchema,
    options: psqlColumnOptionsSchema.optional(),
    nullable: z.boolean(),
    /** Raw SQL expression for `DEFAULT ...` (not quoted). */
    defaultValue: z.string().optional(),
    unique: z.boolean().default(false),
    /** Raw SQL predicate inside `CHECK (...)` (not quoted). */
    check: z.string().optional(),
  }),
);
export type PsqlColumn = z.infer<typeof psqlColumnSchema>;

export const psqlForeignKeyActionSchema = z.enum([
  "NO ACTION",
  "RESTRICT",
  "CASCADE",
  "SET NULL",
  "SET DEFAULT",
]);
export type PsqlForeignKeyAction = z.infer<typeof psqlForeignKeyActionSchema>;

const normalizePsqlForeignKeyAction = (
  value: unknown,
): PsqlForeignKeyAction => {
  const parsed = psqlForeignKeyActionSchema.safeParse(value);
  return parsed.success ? parsed.data : "NO ACTION";
};

export const psqlForeignKeySchema = z.preprocess(
  (value) => {
    if (!value || typeof value !== "object") return value;

    const v = value as Record<string, unknown>;

    return {
      id: typeof v.id === "string" ? v.id : "",
      name: typeof v.name === "string" ? v.name : "",
      type: typeof v.type === "string" ? v.type : "uuid",
      nullable: typeof v.nullable === "boolean" ? v.nullable : false,
      targetTableId: typeof v.targetTableId === "string" ? v.targetTableId : "",
      targetColumnId:
        typeof v.targetColumnId === "string" ? v.targetColumnId : "",
      onDelete: normalizePsqlForeignKeyAction(v.onDelete),
      onUpdate: normalizePsqlForeignKeyAction(v.onUpdate),
    };
  },
  z.object({
    id: z.string().min(1),
    name: z.string(),
    type: psqlColumnTypeSchema,
    nullable: z.boolean(),
    targetTableId: z.string(),
    targetColumnId: z.string(),
    onDelete: psqlForeignKeyActionSchema,
    onUpdate: psqlForeignKeyActionSchema,
  }),
);
export type PsqlForeignKey = z.infer<typeof psqlForeignKeySchema>;

export const psqlIndexMethodSchema = z.enum([
  "btree",
  "hash",
  "gist",
  "spgist",
  "gin",
  "brin",
]);
export type PsqlIndexMethod = z.infer<typeof psqlIndexMethodSchema>;

export const psqlIndexSchema = z.object({
  id: z.string().min(1),
  columns: z.array(z.string()),
  method: psqlIndexMethodSchema.default("btree"),
  unique: z.boolean(),
});
export type PsqlIndex = z.infer<typeof psqlIndexSchema>;

export const psqlTableDataSchema = z.object({
  kind: z.literal("psqlTable"),
  tableName: z.string(),
  primaryKey: z.array(z.string()).default([]),
  columns: z.array(psqlColumnSchema),
  foreignKeys: z.array(psqlForeignKeySchema).default([]),
  indices: z.array(psqlIndexSchema).default([]),
});
export type PsqlTableData = z.infer<typeof psqlTableDataSchema> &
  Record<string, unknown>;

export const annotationDataSchema = z.object({
  kind: z.literal("annotation"),
  label: z.string(),
  color: z.string().default("#818cf8"),
  width: z.number().positive().default(520),
  height: z.number().positive().default(320),
});
export type AnnotationData = z.infer<typeof annotationDataSchema> &
  Record<string, unknown>;

export const blockDataSchema = z.union([
  appViewDataSchema,
  restResourceDataSchema,
  psqlTableDataSchema,
]);
export type BlockData = z.infer<typeof blockDataSchema> &
  Record<string, unknown>;

export const canvasNodeDataSchema = z.union([
  appViewDataSchema,
  restResourceDataSchema,
  psqlTableDataSchema,
  annotationDataSchema,
]);
export type CanvasNodeData = z.infer<typeof canvasNodeDataSchema> &
  Record<string, unknown>;

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const diagramNodeSchema = z.object({
  id: z.string().min(1),
  type: canvasNodeKindSchema,
  position: positionSchema,
  data: canvasNodeDataSchema,
  selected: z.boolean().optional(),
});
export type DiagramNode = z.infer<typeof diagramNodeSchema>;
export type BlockDiagramNode = DiagramNode & {
  type: BlockNodeKind;
  data: BlockData;
};
export type EssaNode = Node<CanvasNodeData, CanvasNodeKind>;

export const connectionKindSchema = z.enum([
  "read",
  "write",
  "read/write",
  "navigate",
]);
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

      if (
        kind === "read" ||
        kind === "write" ||
        kind === "read/write" ||
        kind === "navigate"
      ) {
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
  sourceHandle: z.string().optional().nullable(),
  target: z.string().min(1),
  targetHandle: z.string().optional().nullable(),
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
  psqlEnums: z.array(psqlEnumSchema).default([]),
  nodes: z.array(diagramNodeSchema),
  edges: z.array(diagramEdgeSchema),
});
export type Diagram = z.infer<typeof diagramSchema>;

export const diagramCollectionSchema = z.object({
  version: z.literal(5),
  activeDiagramId: z.string().min(1),
  diagrams: z.array(diagramSchema).min(1),
});
export type DiagramCollection = z.infer<typeof diagramCollectionSchema>;
