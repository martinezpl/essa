import {
  diagramCollectionSchema,
  type DiagramCollection,
} from "../domain/types";

export const LATEST_DIAGRAM_COLLECTION_VERSION = 4;

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
              columns: columns.map((col) => {
                const { primaryKey, ...rest } = col;
                void primaryKey;
                return rest;
              }),
              foreignKeys: foreignKeys.map((fk) => {
                const { primaryKey, ...rest } = fk;
                void primaryKey;
                return rest;
              }),
            },
          };
        }),
      };
    }),
  };
};

const migrateV2toV3 = (v2: Record<string, unknown>): Record<string, unknown> => {
  const diagrams = Array.isArray(v2.diagrams) ? v2.diagrams : [];

  return {
    ...v2,
    version: 3,
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

          const columns = Array.isArray(data.columns) ? data.columns : [];

          return {
            ...n,
            data: {
              ...data,
              columns: columns.map((col: unknown) => {
                if (!col || typeof col !== "object") return col;
                const c = col as Record<string, unknown>;
                return {
                  ...c,
                  unique: typeof c.unique === "boolean" ? c.unique : false,
                };
              }),
            },
          };
        }),
      };
    }),
  };
};

const migrateV3toV4 = (v3: Record<string, unknown>): Record<string, unknown> => {
  const diagrams = Array.isArray(v3.diagrams) ? v3.diagrams : [];

  return {
    ...v3,
    version: 4,
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

          const indices = Array.isArray(data.indices) ? data.indices : [];

          return {
            ...n,
            data: {
              ...data,
              indices: indices.map((index: unknown) => {
                if (!index || typeof index !== "object") return index;
                const { name, ...rest } = index as Record<string, unknown>;
                void name;
                return rest;
              }),
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
    return diagramCollectionSchema.parse(
      migrateV3toV4(migrateV2toV3(migrateV1toV2(raw))),
    );
  }

  if (raw?.version === 2) {
    return diagramCollectionSchema.parse(migrateV3toV4(migrateV2toV3(raw)));
  }

  if (raw?.version === 3) {
    return diagramCollectionSchema.parse(migrateV3toV4(raw));
  }

  return diagramCollectionSchema.parse(value);
};
