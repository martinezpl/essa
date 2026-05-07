import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  cloneDiagramNode,
  createId,
  createDiagramNode,
  createRestResourceMethod,
  createStarterDiagram,
  touchDiagram,
} from "../domain/factories";
import { prepareImportedDiagram } from "../domain/diagramExport";
import {
  createResourceSchemaField,
  createPsqlEnum,
  createPsqlForeignKey,
  createRestMethodInput,
  createPsqlColumn,
  createPsqlIndex,
  DiagramModel,
} from "../domain/model";
import {
  reconcileDiagramAfterPsqlColumnsChange,
  reconcileDiagramAfterPsqlForeignKeysChange,
  reconcileDiagramAfterPsqlIndicesChange,
  reconcileDiagramAfterPsqlTableRemoved,
  reconcileDiagramForPsqlTableNode,
} from "../domain/psqlTableReferences";
import type {
  CanvasNodeData,
  CanvasNodeKind,
  Diagram,
  DiagramCollection,
  DiagramEdge,
  DiagramNode,
  EdgeData,
  ResourceSchemaField,
  RestMethodInputField,
  RestMethodKind,
  RestResourceMethod,
  PsqlColumn,
  PsqlColumnOptions,
  PsqlEnum,
  PsqlForeignKey,
  PsqlIndex,
  PsqlTableData,
} from "../domain/types";
import {
  createInitialCollection,
  loadDiagramCollection,
  saveDiagramCollection,
} from "../storage/diagramStorage";
import {
  createHistory,
  recordHistory,
  redoHistory,
  replaceHistoryPresent,
  undoHistory,
} from "./history";

type NodeDataPatch = Partial<CanvasNodeData>;
type LayoutNode = DiagramNode & {
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
};

const NODE_COLLISION_GAP = 32;
const DEFAULT_NODE_WIDTH = 360;
const DEFAULT_NODE_HEIGHT = 420;

const getNodeBounds = (node: DiagramNode) => {
  const layoutNode = node as LayoutNode;
  const width = layoutNode.measured?.width ?? layoutNode.width ?? DEFAULT_NODE_WIDTH;
  const height = layoutNode.measured?.height ?? layoutNode.height ?? DEFAULT_NODE_HEIGHT;

  return {
    left: node.position.x,
    top: node.position.y,
    right: node.position.x + width,
    bottom: node.position.y + height,
    width,
    height,
  };
};

const boundsOverlap = (
  a: ReturnType<typeof getNodeBounds>,
  b: ReturnType<typeof getNodeBounds>,
) =>
  a.left < b.right + NODE_COLLISION_GAP &&
  a.right + NODE_COLLISION_GAP > b.left &&
  a.top < b.bottom + NODE_COLLISION_GAP &&
  a.bottom + NODE_COLLISION_GAP > b.top;

const resolveNodeCollisions = (
  nodes: DiagramNode[],
  movingNodeIds: ReadonlySet<string>,
): DiagramNode[] => {
  const resolvedNodes = [...nodes];

  movingNodeIds.forEach((nodeId) => {
    const nodeIndex = resolvedNodes.findIndex((node) => node.id === nodeId);

    if (nodeIndex === -1) {
      return;
    }

    let guard = 0;

    while (guard < resolvedNodes.length) {
      const movingNode = resolvedNodes[nodeIndex];

      if (movingNode.data.kind === "annotation") {
        return;
      }

      const movingBounds = getNodeBounds(movingNode);
      const blockingNode = resolvedNodes.find(
        (node) =>
          node.id !== nodeId &&
          node.data.kind !== "annotation" &&
          boundsOverlap(movingBounds, getNodeBounds(node)),
      );

      if (!blockingNode) {
        return;
      }

      const blockingBounds = getNodeBounds(blockingNode);
      resolvedNodes[nodeIndex] = {
        ...movingNode,
        position: {
          x: movingNode.position.x,
          y: blockingBounds.bottom + NODE_COLLISION_GAP,
        },
      };
      guard += 1;
    }
  });

  return resolvedNodes;
};

const patchDiagram = (
  collection: DiagramCollection,
  diagramId: string,
  updater: (diagram: Diagram) => Diagram,
): DiagramCollection => {
  let didUpdateDiagram = false;

  const diagrams = collection.diagrams.map((diagram) => {
    if (diagram.id !== diagramId) {
      return diagram;
    }

    const updatedDiagram = updater(diagram);

    if (Object.is(updatedDiagram, diagram)) {
      return diagram;
    }

    didUpdateDiagram = true;
    return touchDiagram(updatedDiagram);
  });

  if (!didUpdateDiagram && collection.activeDiagramId === diagramId) {
    return collection;
  }

  return {
    ...collection,
    activeDiagramId: diagramId,
    diagrams,
  };
};

const shouldRecordNodeChanges = (changes: NodeChange<DiagramNode>[]) =>
  changes.some((change) => {
    if (change.type === "position") {
      return !change.dragging;
    }

    return change.type !== "select" && change.type !== "dimensions";
  });

const hasActiveNodeDrag = (changes: NodeChange<DiagramNode>[]) =>
  changes.some((change) => change.type === "position" && change.dragging);

const hasCompletedNodeDrag = (changes: NodeChange<DiagramNode>[]) =>
  changes.some((change) => change.type === "position" && change.dragging === false);

const shouldRecordEdgeChanges = (changes: EdgeChange<DiagramEdge>[]) =>
  changes.some((change) => change.type !== "select");

export const duplicateDiagramSelection = (
  nodesToDuplicate: DiagramNode[],
  edges: DiagramEdge[],
) => {
  const selectedIds = new Set(nodesToDuplicate.map((node) => node.id));
  const clonedNodes = nodesToDuplicate.map((node) => cloneDiagramNode(node));
  const idMap = new Map(
    nodesToDuplicate.map((node, index) => [node.id, clonedNodes[index].id]),
  );
  const columnIdMap = new Map<string, string>();
  const fkIdMap = new Map<string, string>();

  nodesToDuplicate.forEach((node, index) => {
    const clonedNode = clonedNodes[index];

    if (node.data.kind !== "psqlTable") {
      return;
    }

    const clonedData = clonedNode.data;

    if (clonedData.kind !== "psqlTable") {
      return;
    }

    node.data.columns.forEach((column, columnIndex) => {
      const clonedColumn = clonedData.columns[columnIndex];

      if (clonedColumn) {
        columnIdMap.set(column.id, clonedColumn.id);
      }
    });

    node.data.foreignKeys.forEach((fk, fkIndex) => {
      const clonedFk = clonedData.foreignKeys[fkIndex];

      if (clonedFk) {
        fkIdMap.set(fk.id, clonedFk.id);
      }
    });
  });

  const nodes = clonedNodes.map((node, nodeIndex) => {
    if (node.data.kind !== "psqlTable") {
      return node;
    }

    const remappedForeignKeys = node.data.foreignKeys.flatMap((foreignKey) => {
      const targetTableId = idMap.get(foreignKey.targetTableId);
      const targetColumnId = columnIdMap.get(foreignKey.targetColumnId);

      return targetTableId && targetColumnId
        ? [{ ...foreignKey, targetTableId, targetColumnId }]
        : [];
    });

    const survivingFkIds = new Set(remappedForeignKeys.map((fk) => fk.id));
    const originalNode = nodesToDuplicate[nodeIndex];
    const originalPrimaryKey =
      originalNode?.data.kind === "psqlTable" ? originalNode.data.primaryKey : [];

    const primaryKey = originalPrimaryKey.flatMap((id) => {
      const clonedColId = columnIdMap.get(id);
      if (clonedColId) return [clonedColId];

      const clonedFkId = fkIdMap.get(id);
      if (clonedFkId && survivingFkIds.has(clonedFkId)) return [clonedFkId];

      return [];
    });

    return {
      ...node,
      data: {
        ...node.data,
        primaryKey,
        foreignKeys: remappedForeignKeys,
        indices: node.data.indices.map((index) => ({
          ...index,
          columns: index.columns.map((columnId) =>
            columnIdMap.get(columnId) ?? columnId,
          ),
        })),
      },
    };
  });

  const internalEdges = edges.flatMap((edge) => {
    const source = idMap.get(edge.source);
    const target = idMap.get(edge.target);

    if (!source || !target || !selectedIds.has(edge.source) || !selectedIds.has(edge.target)) {
      return [];
    }

    return [
      {
        ...edge,
        id: createId("edge"),
        source,
        target,
      },
    ];
  });

  return { edges: internalEdges, nodes };
};

export const useDiagramStore = () => {
  const skipInitialSaveRef = useRef(false);
  const [history, setHistory] = useState(() => {
    const loadResult = loadDiagramCollection();
    skipInitialSaveRef.current = loadResult.didFallback;
    return createHistory(loadResult.collection);
  });
  const pendingNodeDragCollectionRef = useRef<DiagramCollection | null>(null);
  const collection = history.present;

  useEffect(() => {
    if (skipInitialSaveRef.current) {
      skipInitialSaveRef.current = false;
      return;
    }

    saveDiagramCollection(collection);
  }, [collection]);

  const activeDiagram = useMemo(
    () =>
      collection.diagrams.find((diagram) => diagram.id === collection.activeDiagramId) ??
      collection.diagrams[0],
    [collection],
  );

  const updateActiveDiagram = useCallback(
    (updater: (diagram: Diagram) => Diagram) => {
      setHistory((current) => {
        const nextCollection = patchDiagram(
          current.present,
          activeDiagram.id,
          updater,
        );

        return recordHistory(current, nextCollection);
      });
    },
    [activeDiagram.id],
  );

  const selectDiagram = useCallback((diagramId: string) => {
    setHistory((current) =>
      replaceHistoryPresent(current, {
        ...current.present,
        activeDiagramId: diagramId,
      }),
    );
  }, []);

  const createDiagram = useCallback(() => {
    const diagram = createStarterDiagram();
    diagram.name = `Diagram ${collection.diagrams.length + 1}`;

    setHistory((current) =>
      recordHistory(current, {
        ...current.present,
        activeDiagramId: diagram.id,
        diagrams: [...current.present.diagrams, diagram],
      }),
    );
  }, [collection.diagrams.length]);

  const importDiagram = useCallback((diagram: Diagram) => {
    const importedDiagram = prepareImportedDiagram(diagram);

    setHistory((current) =>
      recordHistory(current, {
        ...current.present,
        activeDiagramId: importedDiagram.id,
        diagrams: [...current.present.diagrams, importedDiagram],
      }),
    );

    return importedDiagram.id;
  }, []);

  const renameDiagram = useCallback((diagramId: string, name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setHistory((current) =>
      recordHistory(
        current,
        patchDiagram(current.present, diagramId, (diagram) =>
          diagram.name === trimmedName
            ? diagram
            : {
                ...diagram,
                name: trimmedName,
              },
        ),
      ),
    );
  }, []);

  const deleteDiagram = useCallback((diagramId: string) => {
    setHistory((current) => {
      if (current.present.diagrams.length === 1) {
        return recordHistory(current, createInitialCollection());
      }

      const diagrams = current.present.diagrams.filter(
        (diagram) => diagram.id !== diagramId,
      );

      return recordHistory(current, {
        ...current.present,
        diagrams,
        activeDiagramId:
          current.present.activeDiagramId === diagramId
            ? diagrams[0].id
            : current.present.activeDiagramId,
      });
    });
  }, []);

  const addNode = useCallback(
    (
      kind: CanvasNodeKind,
      position?: { x: number; y: number },
      dataPatch?: NodeDataPatch,
    ) => {
      const createdNode = createDiagramNode(
        kind,
        position ?? {
          x: 120 + activeDiagram.nodes.length * 48,
          y: 140 + activeDiagram.nodes.length * 28,
        },
      );
      const node = dataPatch
        ? {
            ...createdNode,
            data: {
              ...createdNode.data,
              ...dataPatch,
            } as CanvasNodeData,
          }
        : createdNode;

      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: resolveNodeCollisions(
          [...diagram.nodes, node],
          new Set([node.id]),
        ),
      }));

      return node.id;
    },
    [activeDiagram.nodes.length, updateActiveDiagram],
  );

  const duplicateNode = useCallback(
    (node: DiagramNode) => {
      const clonedNode = cloneDiagramNode(node);

      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: resolveNodeCollisions(
          [
            ...diagram.nodes.map((item) => ({
              ...item,
              selected: false,
            })),
            {
              ...clonedNode,
              selected: true,
            },
          ],
          new Set([clonedNode.id]),
        ),
      }));

      return clonedNode.id;
    },
    [updateActiveDiagram],
  );

  const duplicateNodes = useCallback(
    (nodesToDuplicate: DiagramNode[]) => {
      const duplicated = duplicateDiagramSelection(nodesToDuplicate, activeDiagram.edges);

      updateActiveDiagram((diagram) => {
        return {
          ...diagram,
          nodes: resolveNodeCollisions(
            [
              ...diagram.nodes.map((item) => ({
                ...item,
                selected: false,
              })),
              ...duplicated.nodes.map((node) => ({
                ...node,
                selected: true,
              })),
            ],
            new Set(duplicated.nodes.map((node) => node.id)),
          ),
          edges: [...diagram.edges, ...duplicated.edges],
        };
      });

      return duplicated.nodes;
    },
    [activeDiagram.edges, updateActiveDiagram],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      updateActiveDiagram((diagram) => {
        const victim = diagram.nodes.find((node) => node.id === nodeId);

        let next: Diagram = {
          ...diagram,
          nodes: diagram.nodes.filter((node) => node.id !== nodeId),
          edges: diagram.edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId,
          ),
        };

        if (victim?.data.kind === "psqlTable") {
          next = reconcileDiagramAfterPsqlTableRemoved(next, nodeId);
        }

        return next;
      });
    },
    [updateActiveDiagram],
  );

  const deleteEdge = useCallback(
    (edgeId: string) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        edges: diagram.edges.filter((edge) => edge.id !== edgeId),
      }));
    },
    [updateActiveDiagram],
  );

  const updateNodeData = useCallback(
    (nodeId: string, patch: NodeDataPatch) => {
      updateActiveDiagram((diagram) => {
        const node = diagram.nodes.find((item) => item.id === nodeId);

        if (!node) {
          return diagram;
        }

        if (node.data.kind !== "psqlTable") {
          return {
            ...diagram,
            nodes: diagram.nodes.map((item) =>
              item.id === nodeId
                ? {
                    ...item,
                    data: {
                      ...item.data,
                      ...patch,
                    } as CanvasNodeData,
                  }
                : item,
            ),
          };
        }

        const previousTable = node.data;
        const merged = {
          ...previousTable,
          ...patch,
        } as PsqlTableData;

        const intermediate: Diagram = {
          ...diagram,
          nodes: diagram.nodes.map((item) =>
            item.id === nodeId
              ? {
                  ...item,
                  data: merged,
                }
              : item,
          ),
        };

        if ("columns" in patch) {
          return reconcileDiagramAfterPsqlColumnsChange({
            diagram: intermediate,
            tableNodeId: nodeId,
            previousColumns: previousTable.columns,
            mergedTableData: merged,
          });
        }

        if ("foreignKeys" in patch) {
          return reconcileDiagramAfterPsqlForeignKeysChange({
            diagram: intermediate,
            tableNodeId: nodeId,
            mergedTableData: merged,
          });
        }

        if ("indices" in patch) {
          return reconcileDiagramAfterPsqlIndicesChange({
            diagram: intermediate,
            tableNodeId: nodeId,
            mergedTableData: merged,
          });
        }

        return reconcileDiagramForPsqlTableNode(intermediate, nodeId, merged);
      });
    },
    [updateActiveDiagram],
  );

  const resizeAnnotation = useCallback(
    (
      nodeId: string,
      frame: { height: number; left: number; top: number; width: number },
    ) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.id === nodeId && node.data.kind === "annotation"
            ? {
                ...node,
                position: {
                  x: frame.left,
                  y: frame.top,
                },
                data: {
                  ...node.data,
                  width: frame.width,
                  height: frame.height,
                },
              }
            : node,
        ),
      }));
    },
    [updateActiveDiagram],
  );

  const replaceRestMethods = useCallback(
    (nodeId: string, methods: RestResourceMethod[]) => {
      updateNodeData(nodeId, { methods } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const addRestMethod = useCallback(
    (nodeId: string, kind: RestMethodKind) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (
        node?.data.kind !== "restResource" ||
        node.data.methods.some((method) => method.kind === kind)
      ) {
        return;
      }

      replaceRestMethods(nodeId, [
        ...node.data.methods,
        createRestResourceMethod(kind),
      ]);
    },
    [activeDiagram.nodes, replaceRestMethods],
  );

  const removeRestMethod = useCallback(
    (nodeId: string, methodId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "restResource") {
        return;
      }

      replaceRestMethods(
        nodeId,
        node.data.methods.filter((method) => method.id !== methodId),
      );
    },
    [activeDiagram.nodes, replaceRestMethods],
  );

  const updateRestMethod = useCallback(
    (
      nodeId: string,
      methodId: string,
      updater: (method: RestResourceMethod) => RestResourceMethod,
    ) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "restResource") {
        return;
      }

      replaceRestMethods(
        nodeId,
        node.data.methods.map((method) =>
          method.id === methodId ? updater(method) : method,
        ),
      );
    },
    [activeDiagram.nodes, replaceRestMethods],
  );

  const replacePsqlColumns = useCallback(
    (nodeId: string, columns: PsqlColumn[]) => {
      updateActiveDiagram((diagram) => {
        const node = diagram.nodes.find((item) => item.id === nodeId);

        if (node?.data.kind !== "psqlTable") {
          return diagram;
        }

        const merged: PsqlTableData = {
          ...node.data,
          columns,
        };

        const intermediate: Diagram = {
          ...diagram,
          nodes: diagram.nodes.map((item) =>
            item.id === nodeId ? { ...item, data: merged } : item,
          ),
        };

        return reconcileDiagramAfterPsqlColumnsChange({
          diagram: intermediate,
          tableNodeId: nodeId,
          previousColumns: node.data.columns,
          mergedTableData: merged,
        });
      });
    },
    [updateActiveDiagram],
  );

  const updatePsqlColumnOptions = useCallback(
    (
      nodeId: string,
      columnId: string,
      options: PsqlColumnOptions | undefined,
    ) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return;
      }

      replacePsqlColumns(
        nodeId,
        node.data.columns.map((column) =>
          column.id === columnId ? { ...column, options } : column,
        ),
      );
    },
    [activeDiagram.nodes, replacePsqlColumns],
  );

  const replacePsqlEnums = useCallback(
    (enums: PsqlEnum[]) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        psqlEnums: enums,
      }));
    },
    [updateActiveDiagram],
  );

  const addPsqlEnum = useCallback(() => {
    const psqlEnum = createPsqlEnum();

    updateActiveDiagram((diagram) => ({
      ...diagram,
      psqlEnums: [...diagram.psqlEnums, psqlEnum],
    }));

    return psqlEnum.id;
  }, [updateActiveDiagram]);

  const replacePsqlForeignKeys = useCallback(
    (nodeId: string, foreignKeys: PsqlForeignKey[]) => {
      updateActiveDiagram((diagram) => {
        const node = diagram.nodes.find((item) => item.id === nodeId);

        if (node?.data.kind !== "psqlTable") {
          return diagram;
        }

        const merged: PsqlTableData = {
          ...node.data,
          foreignKeys,
        };

        const intermediate: Diagram = {
          ...diagram,
          nodes: diagram.nodes.map((item) =>
            item.id === nodeId ? { ...item, data: merged } : item,
          ),
        };

        return reconcileDiagramAfterPsqlForeignKeysChange({
          diagram: intermediate,
          tableNodeId: nodeId,
          mergedTableData: merged,
        });
      });
    },
    [updateActiveDiagram],
  );

  const replacePsqlIndices = useCallback(
    (nodeId: string, indices: PsqlIndex[]) => {
      updateActiveDiagram((diagram) => {
        const node = diagram.nodes.find((item) => item.id === nodeId);

        if (node?.data.kind !== "psqlTable") {
          return diagram;
        }

        const merged: PsqlTableData = {
          ...node.data,
          indices,
        };

        const intermediate: Diagram = {
          ...diagram,
          nodes: diagram.nodes.map((item) =>
            item.id === nodeId ? { ...item, data: merged } : item,
          ),
        };

        return reconcileDiagramAfterPsqlIndicesChange({
          diagram: intermediate,
          tableNodeId: nodeId,
          mergedTableData: merged,
        });
      });
    },
    [updateActiveDiagram],
  );

  const addPsqlIndex = useCallback(
    (nodeId: string): string | null => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return null;
      }

      const index = createPsqlIndex();
      replacePsqlIndices(nodeId, [...node.data.indices, index]);
      return index.id;
    },
    [activeDiagram.nodes, replacePsqlIndices],
  );

  const addPsqlForeignKey = useCallback(
    (nodeId: string): string | null => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return null;
      }

      const foreignKey = createPsqlForeignKey();
      replacePsqlForeignKeys(nodeId, [...node.data.foreignKeys, foreignKey]);
      return foreignKey.id;
    },
    [activeDiagram.nodes, replacePsqlForeignKeys],
  );

  const replaceRestMethodInputs = useCallback(
    (nodeId: string, methodId: string, inputs: RestMethodInputField[]) => {
      updateRestMethod(nodeId, methodId, (method) => ({
        ...method,
        input: inputs,
      }));
    },
    [updateRestMethod],
  );

  const addRestMethodInput = useCallback(
    (nodeId: string, methodId: string): string | null => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "restResource") {
        return null;
      }

      const method = node.data.methods.find((item) => item.id === methodId);

      if (!method) {
        return null;
      }

      const input = createRestMethodInput();
      replaceRestMethodInputs(nodeId, methodId, [...method.input, input]);
      return input.id;
    },
    [activeDiagram.nodes, replaceRestMethodInputs],
  );

  const replaceResourceSchema = useCallback(
    (nodeId: string, schema: ResourceSchemaField[]) => {
      updateNodeData(nodeId, { schema } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const addResourceSchemaField = useCallback(
    (nodeId: string, currentSchema: ResourceSchemaField[]): string => {
      const field = createResourceSchemaField();
      replaceResourceSchema(nodeId, [...currentSchema, field]);
      return field.id;
    },
    [replaceResourceSchema],
  );

  const updateEdgeData = useCallback(
    (edgeId: string, patch: Partial<EdgeData>) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        edges: diagram.edges.map((edge) =>
          edge.id === edgeId
            ? {
                ...edge,
                data: {
                  ...edge.data,
                  ...patch,
                },
              }
            : edge,
        ),
      }));
    },
    [updateActiveDiagram],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<DiagramNode>[]) => {
      setHistory((current) => {
        if (hasActiveNodeDrag(changes) && !pendingNodeDragCollectionRef.current) {
          pendingNodeDragCollectionRef.current = current.present;
        }

        const settledMovingNodeIds = new Set(
          changes.flatMap((change) =>
            change.type === "position" && change.dragging === false ? [change.id] : [],
          ),
        );
        const nextCollection = patchDiagram(current.present, activeDiagram.id, (diagram) => {
          const removedPsqlTableIds = changes.flatMap((change) => {
            if (change.type !== "remove") {
              return [];
            }

            const removed = diagram.nodes.find((node) => node.id === change.id);

            return removed?.data.kind === "psqlTable" ? [change.id] : [];
          });

          const nodes = applyNodeChanges(changes, diagram.nodes) as DiagramNode[];

          let nextDiagram: Diagram = {
            ...diagram,
            nodes:
              settledMovingNodeIds.size > 0
                ? resolveNodeCollisions(nodes, settledMovingNodeIds)
                : nodes,
            edges: diagram.edges.filter(
              (edge) =>
                !changes.some(
                  (change) =>
                    change.type === "remove" &&
                    (edge.source === change.id || edge.target === change.id),
                ),
            ),
          };

          for (const tableId of removedPsqlTableIds) {
            nextDiagram = reconcileDiagramAfterPsqlTableRemoved(nextDiagram, tableId);
          }

          return nextDiagram;
        });

        if (!shouldRecordNodeChanges(changes)) {
          return replaceHistoryPresent(current, nextCollection);
        }

        const previous = hasCompletedNodeDrag(changes)
          ? (pendingNodeDragCollectionRef.current ?? current.present)
          : current.present;

        pendingNodeDragCollectionRef.current = null;
        return recordHistory(current, nextCollection, { previous });
      });
    },
    [activeDiagram.id],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<DiagramEdge>[]) => {
      setHistory((current) => {
        const nextCollection = patchDiagram(current.present, activeDiagram.id, (diagram) => ({
          ...diagram,
          edges: applyEdgeChanges(changes, diagram.edges) as DiagramEdge[],
        }));

        if (!shouldRecordEdgeChanges(changes)) {
          return replaceHistoryPresent(current, nextCollection);
        }

        return recordHistory(current, nextCollection);
      });
    },
    [activeDiagram.id],
  );

  const connectNodes = useCallback(
    (sourceId?: string | null, targetId?: string | null) => {
      updateActiveDiagram((diagram) => {
        const edge = DiagramModel.hydrate(diagram)
          .createConnection(sourceId, targetId)
          ?.serialize();

        if (!edge) {
          return diagram;
        }

        return {
          ...diagram,
          edges: [...diagram.edges, edge],
        };
      });
    },
    [updateActiveDiagram],
  );

  const addPsqlColumn = useCallback(
    (nodeId: string): string | null => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return null;
      }

      const column = createPsqlColumn();
      replacePsqlColumns(nodeId, [...node.data.columns, column]);
      return column.id;
    },
    [activeDiagram.nodes, replacePsqlColumns],
  );

  const undo = useCallback(() => {
    pendingNodeDragCollectionRef.current = null;
    setHistory(undoHistory);
  }, []);

  const redo = useCallback(() => {
    pendingNodeDragCollectionRef.current = null;
    setHistory(redoHistory);
  }, []);

  return {
    activeDiagram,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addRestMethodInput,
    addPsqlColumn,
    addPsqlEnum,
    addPsqlForeignKey,
    addPsqlIndex,
    collection,
    connectNodes,
    createDiagram,
    deleteDiagram,
    deleteEdge,
    deleteNode,
    duplicateNode,
    duplicateNodes,
    importDiagram,
    onEdgesChange,
    onNodesChange,
    renameDiagram,
    replaceResourceSchema,
    replaceRestMethodInputs,
    replaceRestMethods,
    replacePsqlColumns,
    replacePsqlEnums,
    replacePsqlForeignKeys,
    replacePsqlIndices,
    removeRestMethod,
    resizeAnnotation,
    selectDiagram,
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    redo,
    undo,
    updateEdgeData,
    updateNodeData,
    updatePsqlColumnOptions,
    updateRestMethod,
  };
};
