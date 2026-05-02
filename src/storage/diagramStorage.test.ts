import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialCollection, loadDiagramCollection, saveDiagramCollection } from "./diagramStorage";

const STORAGE_KEY = "essa.diagrams.v1";

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

    expect(collection.version).toBe(1);
    expect(collection.diagrams).toHaveLength(1);
    expect(collection.activeDiagramId).toBe(collection.diagrams[0].id);
    expect(collection.diagrams[0]).toMatchObject({
      name: "Starter Diagram",
      nodes: expect.arrayContaining([
        expect.objectContaining({ type: "appView" }),
        expect.objectContaining({ type: "restResource" }),
        expect.objectContaining({ type: "psqlTable" }),
      ]),
    });
  });

  it("persists and reloads a valid diagram collection", () => {
    const collection = createInitialCollection();

    saveDiagramCollection(collection);

    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(collection),
    );
    expect(loadDiagramCollection()).toEqual(collection);
  });

  it("falls back to an initial collection when nothing is stored", () => {
    const collection = loadDiagramCollection();

    expect(collection.version).toBe(1);
    expect(collection.diagrams[0].name).toBe("Starter Diagram");
  });

  it("falls back to an initial collection for invalid JSON", () => {
    localStorageMock.setItem(STORAGE_KEY, "{not json");

    const collection = loadDiagramCollection();

    expect(collection.version).toBe(1);
    expect(collection.diagrams[0].name).toBe("Starter Diagram");
  });

  it("falls back to an initial collection for schema-invalid data", () => {
    localStorageMock.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        activeDiagramId: "",
        diagrams: [],
      }),
    );

    const collection = loadDiagramCollection();

    expect(collection.version).toBe(1);
    expect(collection.diagrams[0].name).toBe("Starter Diagram");
  });
});
