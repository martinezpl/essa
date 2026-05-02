import type {
  AppViewComponent,
  BlockKind,
  ConnectionKind,
  JsonFieldType,
  PsqlColumnType,
  ResourceSchemaField,
  RestResourceMethod,
  PsqlColumn,
  PsqlForeignKey,
  PsqlIndex,
} from "./types";

export type MermaidBlockSpec = {
  id: string;
  kind: BlockKind;
  label: string;
  title: string;
};

export type MermaidConnectionSpec = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
};

export type OpenApiResourceSpec = {
  id: string;
  resourceName: string;
  methods: RestResourceMethod[];
  schema: ResourceSchemaField[];
};

export type PsqlTableSpec = {
  id: string;
  tableName: string;
  columns: PsqlColumn[];
  foreignKeys: PsqlForeignKey[];
  indices: PsqlIndex[];
};

export type AppViewSpec = {
  id: string;
  route: string;
  components: AppViewComponent[];
};

export type SchemaSpec = {
  allowedTypes: readonly JsonFieldType[] | readonly PsqlColumnType[];
};

export type ConnectionSpec = {
  kind: ConnectionKind;
  dataPath: string;
};
