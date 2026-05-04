import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createInitialCollection,
  getPrimaryDiagramStorageKey,
  loadDiagramCollection,
  saveDiagramCollection,
} from "./diagramStorage";
import { LATEST_DIAGRAM_COLLECTION_VERSION } from "./diagramMigrations";

const HISTORICAL_STORAGE_KEY = "essa.diagrams.v1";

const createMemoryStorage = () => {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear: vi.fn(() => values.clear()),
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    key: vi.fn((index: number) => [...values.keys()][index] ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  } satisfies Storage;
};

describe("diagram storage", () => {
  let localStorageMock: ReturnType<typeof createMemoryStorage>;

  beforeEach(() => {
    localStorageMock = createMemoryStorage();
    vi.stubGlobal("localStorage", localStorageMock);
  });

  it("creates an initial collection with a starter diagram", () => {
    const collection = createInitialCollection();

    expect(collection.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    expect(collection.diagrams).toHaveLength(1);
    expect(collection.activeDiagramId).toBe(collection.diagrams[0].id);
    expect(collection.diagrams[0]).toMatchObject({
      name: "Starter Diagram",
      nodes: expect.arrayContaining([
        expect.objectContaining({ type: "restResource" }),
        expect.objectContaining({ type: "psqlTable" }),
      ]),
    });
  });

  it("persists and reloads a valid diagram collection", () => {
    const collection = createInitialCollection();
    const primaryStorageKey = getPrimaryDiagramStorageKey();

    saveDiagramCollection(collection);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      primaryStorageKey,
      JSON.stringify(collection),
    );
    expect(loadDiagramCollection()).toEqual({
      collection,
      didFallback: false,
    });
    expect(localStorageMock.setItem).toHaveBeenCalledTimes(1);
  });

  it("falls back to an initial collection when nothing is stored", () => {
    const result = loadDiagramCollection();

    expect(result.didFallback).toBe(false);
    expect(result.collection.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    expect(result.collection.diagrams[0].name).toBe("Starter Diagram");
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("falls back to an initial collection for invalid JSON without overwriting storage", () => {
    localStorageMock.setItem(HISTORICAL_STORAGE_KEY, "{not json");
    localStorageMock.setItem.mockClear();

    const result = loadDiagramCollection();

    expect(result.didFallback).toBe(true);
    expect(result.collection.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    expect(result.collection.diagrams[0].name).toBe("Starter Diagram");
    expect(localStorageMock.getItem(HISTORICAL_STORAGE_KEY)).toBe("{not json");
    expect(localStorageMock.getItem(getPrimaryDiagramStorageKey())).toBeNull();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("falls back to an initial collection for schema-invalid data without overwriting storage", () => {
    const rawValue = JSON.stringify({
      version: 1,
      activeDiagramId: "",
      diagrams: [],
    });
    localStorageMock.setItem(
      HISTORICAL_STORAGE_KEY,
      rawValue,
    );
    localStorageMock.setItem.mockClear();

    const result = loadDiagramCollection();

    expect(result.didFallback).toBe(true);
    expect(result.collection.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    expect(result.collection.diagrams[0].name).toBe("Starter Diagram");
    expect(localStorageMock.getItem(HISTORICAL_STORAGE_KEY)).toBe(rawValue);
    expect(localStorageMock.getItem(getPrimaryDiagramStorageKey())).toBeNull();
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  it("reads historical storage, migrates it, and writes only the current key", () => {
    const legacyValue = JSON.stringify({
      version: 2,
      activeDiagramId: "diagram-1",
      diagrams: [
        {
          id: "diagram-1",
          name: "Stored work",
          createdAt: "2026-05-02T00:00:00.000Z",
          updatedAt: "2026-05-02T00:00:00.000Z",
          psqlEnums: [],
          nodes: [
            {
              id: "table-1",
              type: "psqlTable",
              position: { x: 0, y: 0 },
              data: {
                kind: "psqlTable",
                tableName: "items",
                primaryKey: [],
                columns: [
                  { id: "column-1", name: "id", type: "uuid", nullable: false },
                ],
                foreignKeys: [],
                indices: [],
              },
            },
          ],
          edges: [],
        },
      ],
    });
    localStorageMock.setItem(HISTORICAL_STORAGE_KEY, legacyValue);
    localStorageMock.setItem.mockClear();

    const result = loadDiagramCollection();
    const primaryStorageKey = getPrimaryDiagramStorageKey();

    expect(result.didFallback).toBe(false);
    expect(result.collection.version).toBe(LATEST_DIAGRAM_COLLECTION_VERSION);
    expect(result.collection.diagrams[0].name).toBe("Stored work");
    expect(localStorageMock.getItem(HISTORICAL_STORAGE_KEY)).toBe(legacyValue);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      primaryStorageKey,
      JSON.stringify(result.collection),
    );
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith(
      HISTORICAL_STORAGE_KEY,
      expect.any(String),
    );
  });

  it("prefers current storage over older valid storage", () => {
    const current = createInitialCollection();
    const historical = {
      ...current,
      id: undefined,
      activeDiagramId: current.diagrams[0].id,
      diagrams: [{ ...current.diagrams[0], name: "Historical" }],
    };
    localStorageMock.setItem(HISTORICAL_STORAGE_KEY, JSON.stringify(historical));
    saveDiagramCollection(current);
    localStorageMock.setItem.mockClear();

    const result = loadDiagramCollection();

    expect(result).toEqual({
      collection: current,
      didFallback: false,
    });
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });
});
