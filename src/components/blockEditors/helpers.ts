import type {
  AppViewComponent,
  ResourceSchemaField,
  RestMethodKind,
  PsqlColumn,
} from "../../domain/types";

export const updateComponent = (
  components: AppViewComponent[],
  componentId: string,
  patch: Partial<AppViewComponent>,
) =>
  components.map((component) =>
    component.id === componentId ? { ...component, ...patch } : component,
  );

export const updateColumn = (
  columns: PsqlColumn[],
  columnId: string,
  patch: Partial<PsqlColumn>,
) =>
  columns.map((column) =>
    column.id === columnId ? { ...column, ...patch } : column,
  );

export const updateSchemaField = (
  schema: ResourceSchemaField[],
  fieldId: string,
  patch: Partial<ResourceSchemaField>,
) =>
  schema.map((field) =>
    field.id === fieldId ? { ...field, ...patch } : field,
  );

export const toggleFieldSelection = (
  fields: string[],
  field: string,
  checked: boolean,
) => {
  if (field === "all") {
    return checked ? ["all"] : [];
  }

  const withoutAll = fields.filter((item) => item !== "all");

  if (checked) {
    return [...withoutAll, field];
  }

  return withoutAll.filter((item) => item !== field);
};

export const httpVerbClass = (kind: RestMethodKind) => {
  if (kind.startsWith("GET")) return "method-pill--get";
  if (kind.startsWith("POST")) return "method-pill--post";
  if (kind.startsWith("PATCH")) return "method-pill--patch";
  if (kind.startsWith("DELETE")) return "method-pill--delete";

  return "";
};
