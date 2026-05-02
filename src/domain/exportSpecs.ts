import type {
  AppViewComponent,
  BlockKind,
  ConnectionKind,
  JsonFieldType,
  PostgresType,
  ResourceSchemaField,
  RestResourceMethod,
  SqlColumn,
  SqlIndex,
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

export type SqlTableSpec = {
  id: string;
  tableName: string;
  columns: SqlColumn[];
  indices: SqlIndex[];
};

export type AppViewSpec = {
  id: string;
  route: string;
  components: AppViewComponent[];
};

export type SchemaSpec = {
  allowedTypes: readonly JsonFieldType[] | readonly PostgresType[];
};

export type ConnectionSpec = {
  kind: ConnectionKind;
  dataPath: string;
};
