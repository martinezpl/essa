import type { Diagram } from "./types";

export const countPsqlForeignKeyConnections = (diagram: Diagram) => {
  const psqlTableById = new Map(
    diagram.nodes
      .filter((node) => node.data.kind === "psqlTable")
      .map((node) => [node.id, node]),
  );

  return diagram.nodes.reduce((count, node) => {
    if (node.data.kind !== "psqlTable") {
      return count;
    }

    const validForeignKeys = node.data.foreignKeys.filter((foreignKey) => {
      if (!foreignKey.targetTableId || !foreignKey.targetColumnId) {
        return false;
      }

      const targetTable = psqlTableById.get(foreignKey.targetTableId);
      return Boolean(
        targetTable?.data.kind === "psqlTable" &&
          targetTable.data.columns.some(
            (column) =>
              column.id === foreignKey.targetColumnId && column.primaryKey,
          ),
      );
    });

    return count + validForeignKeys.length;
  }, 0);
};

export const countDiagramConnections = (diagram: Diagram) =>
  diagram.edges.length + countPsqlForeignKeyConnections(diagram);
