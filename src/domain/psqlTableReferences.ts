import type {
  Diagram,
  DiagramEdge,
  DiagramNode,
  PsqlColumn,
  PsqlColumnType,
  PsqlTableData,
} from "./types";

/** Column ids and foreign-key row ids that may appear in `primaryKey` and `indices[].columns`. */
const collectPsqlTableFieldIds = (data: PsqlTableData): Set<string> => {
  const ids = new Set<string>();
  for (const column of data.columns) {
    ids.add(column.id);
  }
  for (const foreignKey of data.foreignKeys) {
    ids.add(foreignKey.id);
  }
  return ids;
};

/**
 * Removes stale ids from `primaryKey` and `indices[].columns` so they only
 * reference existing columns or foreign-key rows on the same table.
 */
export const reconcilePsqlTableData = (data: PsqlTableData): PsqlTableData => {
  const validIds = collectPsqlTableFieldIds(data);
  const primaryKey = data.primaryKey.filter((id) => validIds.has(id));
  const indices = data.indices.map((index) => ({
    ...index,
    columns: index.columns.filter((id) => validIds.has(id)),
  }));

  if (
    primaryKey.length === data.primaryKey.length &&
    indices.length === data.indices.length &&
    indices.every((index, i) => {
      const prev = data.indices[i];
      return (
        prev &&
        index.columns.length === prev.columns.length &&
        index.columns.every((id, j) => id === prev.columns[j])
      );
    })
  ) {
    return data;
  }

  return {
    ...data,
    primaryKey,
    indices,
  };
};

const columnTypeById = (
  columns: readonly PsqlColumn[],
): Map<string, PsqlColumnType> =>
  new Map(columns.map((column) => [column.id, column.type]));

/**
 * After columns on `targetTableId` change: drop FKs that pointed at removed
 * columns, and sync `foreignKey.type` when the target column's type changed.
 */
export const reconcileForeignKeysForTargetColumnChange = (
  nodes: DiagramNode[],
  targetTableId: string,
  previousColumns: readonly PsqlColumn[],
  nextColumns: readonly PsqlColumn[],
): DiagramNode[] => {
  const prevIds = new Set(previousColumns.map((column) => column.id));
  const nextIds = new Set(nextColumns.map((column) => column.id));
  const removedTargetColumnIds = [...prevIds].filter((id) => !nextIds.has(id));

  const prevTypes = columnTypeById(previousColumns);
  const nextTypes = columnTypeById(nextColumns);

  return nodes.map((node) => {
    if (node.data.kind !== "psqlTable") {
      return node;
    }

    if (
      !node.data.foreignKeys.some(
        (foreignKey) => foreignKey.targetTableId === targetTableId,
      )
    ) {
      return node;
    }

    let foreignKeys = node.data.foreignKeys;

    if (removedTargetColumnIds.length > 0) {
      foreignKeys = foreignKeys.filter(
        (foreignKey) =>
          foreignKey.targetTableId !== targetTableId ||
          !removedTargetColumnIds.includes(foreignKey.targetColumnId),
      );
    }

    const synced = foreignKeys.map((foreignKey) => {
      if (foreignKey.targetTableId !== targetTableId) {
        return foreignKey;
      }
      const nextType = nextTypes.get(foreignKey.targetColumnId);
      if (!nextType || foreignKey.type === nextType) {
        return foreignKey;
      }
      const prevType = prevTypes.get(foreignKey.targetColumnId);
      if (prevType === undefined || prevType === nextType) {
        return foreignKey;
      }
      return { ...foreignKey, type: nextType };
    });

    const nextData = reconcilePsqlTableData({
      ...node.data,
      foreignKeys: synced,
    });

    return {
      ...node,
      data: nextData,
    };
  });
};

const resolvePsqlColumn = (
  nodes: readonly DiagramNode[],
  tableId: string,
  columnId: string,
): PsqlColumn | undefined => {
  const table = nodes.find(
    (node): node is DiagramNode & { data: PsqlTableData } =>
      node.id === tableId && node.data.kind === "psqlTable",
  );
  return table?.data.columns.find((column) => column.id === columnId);
};

/**
 * Drops persisted REST schema fields whose `sourceTableId` / `sourceColumnId`
 * no longer resolve to a column on a connected table (or table missing).
 */
export const reconcileRestResourceSchemas = (
  nodes: DiagramNode[],
): DiagramNode[] =>
  nodes.map((node) => {
    if (node.data.kind !== "restResource") {
      return node;
    }

    const schema = node.data.schema.filter((field) => {
      if (!field.sourceTableId || !field.sourceColumnId) {
        return true;
      }
      return Boolean(resolvePsqlColumn(nodes, field.sourceTableId, field.sourceColumnId));
    });

    if (schema.length === node.data.schema.length) {
      return node;
    }

    return {
      ...node,
      data: {
        ...node.data,
        schema,
      },
    };
  });

const psqlTableColumnNames = (
  nodes: readonly DiagramNode[],
  tableId: string,
): Set<string> => {
  const table = nodes.find(
    (node): node is DiagramNode & { data: PsqlTableData } =>
      node.id === tableId && node.data.kind === "psqlTable",
  );
  if (!table) {
    return new Set();
  }
  return new Set(
    table.data.columns
      .map((column) => column.name.trim())
      .filter((name) => name.length > 0),
  );
};

/**
 * Resets `edge.data.dataPath` to `"all"` when it referenced PSQL column names
 * that no longer exist on the connected table (resource↔table edges).
 */
export const reconcileEdgesForPsqlColumnNames = (
  edges: DiagramEdge[],
  nodes: DiagramNode[],
): DiagramEdge[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  return edges.map((edge) => {
    const dataPath = edge.data.dataPath;
    if (!dataPath || dataPath === "all" || dataPath === "FK") {
      return edge;
    }

    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);

    const collectNames = (node: DiagramNode | undefined): Set<string> => {
      if (!node) {
        return new Set();
      }
      if (node.data.kind === "restResource") {
        return new Set(
          node.data.schema
            .map((field) => field.name.trim())
            .filter((name) => name.length > 0),
        );
      }
      if (node.data.kind === "psqlTable") {
        return psqlTableColumnNames(nodes, node.id);
      }
      return new Set();
    };

    const sourceNames = collectNames(source);
    const targetNames = collectNames(target);
    const valid = new Set([...sourceNames, ...targetNames, "all"]);
    const selectedNames = dataPath
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean);

    if (selectedNames.length > 0 && selectedNames.every((name) => valid.has(name))) {
      return edge;
    }

    return {
      ...edge,
      data: {
        ...edge.data,
        dataPath: "all",
      },
    };
  });
};

export type PsqlTableColumnChangeContext = {
  diagram: Diagram;
  tableNodeId: string;
  previousColumns: readonly PsqlColumn[];
  mergedTableData: PsqlTableData;
};

/**
 * Applies cross-node consistency after a PSQL table's column list was updated:
 * reconciles the table's own PK/indices, fixes FKs on other tables, cleans
 * REST schemas, and normalizes edge `dataPath` when a column name disappeared.
 */
export const reconcileDiagramAfterPsqlColumnsChange = ({
  diagram,
  tableNodeId,
  previousColumns,
  mergedTableData,
}: PsqlTableColumnChangeContext): Diagram => {
  const selfReconciled = reconcilePsqlTableData(mergedTableData);

  let nodes = diagram.nodes.map((node) =>
    node.id === tableNodeId && node.data.kind === "psqlTable"
      ? { ...node, data: selfReconciled }
      : node,
  );

  nodes = reconcileForeignKeysForTargetColumnChange(
    nodes,
    tableNodeId,
    previousColumns,
    selfReconciled.columns,
  );

  nodes = reconcileRestResourceSchemas(nodes);

  const edges = reconcileEdgesForPsqlColumnNames(diagram.edges, nodes);

  return {
    ...diagram,
    nodes,
    edges,
  };
};

export type PsqlTableForeignKeysChangeContext = {
  diagram: Diagram;
  tableNodeId: string;
  mergedTableData: PsqlTableData;
};

export const reconcileDiagramAfterPsqlForeignKeysChange = ({
  diagram,
  tableNodeId,
  mergedTableData,
}: PsqlTableForeignKeysChangeContext): Diagram => {
  const selfReconciled = reconcilePsqlTableData(mergedTableData);

  let nodes = diagram.nodes.map((node) =>
    node.id === tableNodeId && node.data.kind === "psqlTable"
      ? { ...node, data: selfReconciled }
      : node,
  );

  nodes = reconcileRestResourceSchemas(nodes);
  const edges = reconcileEdgesForPsqlColumnNames(diagram.edges, nodes);

  return {
    ...diagram,
    nodes,
    edges,
  };
};

export type PsqlTableIndicesChangeContext = {
  diagram: Diagram;
  tableNodeId: string;
  mergedTableData: PsqlTableData;
};

export const reconcileDiagramAfterPsqlIndicesChange = ({
  diagram,
  tableNodeId,
  mergedTableData,
}: PsqlTableIndicesChangeContext): Diagram => {
  const selfReconciled = reconcilePsqlTableData(mergedTableData);

  const nodes = diagram.nodes.map((node) =>
    node.id === tableNodeId && node.data.kind === "psqlTable"
      ? { ...node, data: selfReconciled }
      : node,
  );

  const edges = reconcileEdgesForPsqlColumnNames(diagram.edges, nodes);

  return {
    ...diagram,
    nodes,
    edges,
  };
};

/**
 * When a PSQL table node is removed: strip FKs targeting it, clean resource
 * schemas, reconcile remaining tables' PK/indices, and normalize edges.
 */
export const reconcileDiagramAfterPsqlTableRemoved = (
  diagram: Diagram,
  removedTableId: string,
): Diagram => {
  let nodes = diagram.nodes.map((node) => {
    if (node.data.kind !== "psqlTable") {
      return node;
    }

    const foreignKeys = node.data.foreignKeys.filter(
      (foreignKey) => foreignKey.targetTableId !== removedTableId,
    );

    if (foreignKeys.length === node.data.foreignKeys.length) {
      return node;
    }

    return {
      ...node,
      data: reconcilePsqlTableData({
        ...node.data,
        foreignKeys,
      }),
    };
  });

  nodes = nodes.map((node) => {
    if (node.data.kind !== "restResource") {
      return node;
    }

    const schema = node.data.schema.filter(
      (field) => field.sourceTableId !== removedTableId,
    );

    if (schema.length === node.data.schema.length) {
      return node;
    }

    return {
      ...node,
      data: { ...node.data, schema },
    };
  });

  nodes = nodes.map((node) =>
    node.data.kind === "psqlTable"
      ? { ...node, data: reconcilePsqlTableData(node.data) }
      : node,
  );

  nodes = reconcileRestResourceSchemas(nodes);
  const edges = reconcileEdgesForPsqlColumnNames(diagram.edges, nodes);

  return {
    ...diagram,
    nodes,
    edges,
  };
};

/**
 * Full pass after an arbitrary `psqlTable` patch: self PK/indices, REST
 * schema cleanup, and edge dataPath names.
 */
export const reconcileDiagramForPsqlTableNode = (
  diagram: Diagram,
  tableNodeId: string,
  mergedTableData: PsqlTableData,
): Diagram => {
  const selfReconciled = reconcilePsqlTableData(mergedTableData);

  let nodes = diagram.nodes.map((node) =>
    node.id === tableNodeId && node.data.kind === "psqlTable"
      ? { ...node, data: selfReconciled }
      : node,
  );

  nodes = reconcileRestResourceSchemas(nodes);
  const edges = reconcileEdgesForPsqlColumnNames(diagram.edges, nodes);

  return {
    ...diagram,
    nodes,
    edges,
  };
};
