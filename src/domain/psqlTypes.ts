import type { PsqlColumn, PsqlEnum } from "./types";

export const formatPsqlColumnType = (
  column: PsqlColumn,
  psqlEnums: PsqlEnum[] = [],
) => {
  const { options, type } = column;

  if (type === "enum") {
    const enumName = psqlEnums.find((item) => item.id === options?.enumId)?.name;
    return enumName || "enum";
  }

  if (
    type.endsWith("[]") &&
    options?.arrayItemType &&
    !options.arrayItemType.endsWith("[]")
  ) {
    return `${options.arrayItemType}[]`;
  }

  if (
    (type === "varchar" || type === "char" || type === "bit" || type === "varbit") &&
    options?.length
  ) {
    return `${type}(${options.length})`;
  }

  if ((type === "numeric" || type === "decimal") && options?.precision !== undefined) {
    return options.scale !== undefined
      ? `${type}(${options.precision}, ${options.scale})`
      : `${type}(${options.precision})`;
  }

  if (
    (type === "time" ||
      type === "timetz" ||
      type === "timestamp" ||
      type === "timestamptz" ||
      type === "interval") &&
    options?.precision !== undefined
  ) {
    return `${type}(${options.precision})`;
  }

  return type;
};
