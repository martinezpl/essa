import {
  diagramCollectionSchema,
  type DiagramCollection,
} from "../domain/types";

export const LATEST_DIAGRAM_COLLECTION_VERSION = 2;

const migrateV1toV2 = (v1: Record<string, unknown>): Record<string, unknown> => {
  const diagrams = Array.isArray(v1.diagrams) ? v1.diagrams : [];

  return {
    ...v1,
    version: 2,
    diagrams: diagrams.map((diagram: unknown) => {
      if (!diagram || typeof diagram !== "object") return diagram;
      const d = diagram as Record<string, unknown>;
      const nodes = Array.isArray(d.nodes) ? d.nodes : [];

      return {
        ...d,
        nodes: nodes.map((node: unknown) => {
          if (!node || typeof node !== "object") return node;
          const n = node as Record<string, unknown>;

          if (!n.data || typeof n.data !== "object") return node;
          const data = n.data as Record<string, unknown>;

          if (data.kind !== "psqlTable") return node;

          type V1Column = { id: string; primaryKey?: boolean };
          type V1Fk = { id: string; primaryKey?: boolean };

          const columns = Array.isArray(data.columns)
            ? (data.columns as V1Column[])
            : [];
          const foreignKeys = Array.isArray(data.foreignKeys)
            ? (data.foreignKeys as V1Fk[])
            : [];

          const pkIds = [
            ...columns.filter((c) => c.primaryKey).map((c) => c.id),
            ...foreignKeys.filter((fk) => fk.primaryKey).map((fk) => fk.id),
          ];

          return {
            ...n,
            data: {
              ...data,
              primaryKey: pkIds,
              columns: columns.map(({ primaryKey: _pk, ...col }) => col),
              foreignKeys: foreignKeys.map(({ primaryKey: _pk, ...fk }) => fk),
            },
          };
        }),
      };
    }),
  };
};

export const migrateDiagramCollection = (value: unknown): DiagramCollection => {
  const raw = value as Record<string, unknown>;

  if (raw?.version === 1) {
    return diagramCollectionSchema.parse(migrateV1toV2(raw));
  }

  return diagramCollectionSchema.parse(value);
};
