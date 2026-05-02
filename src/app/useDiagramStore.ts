import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyEdgeChanges,
  applyNodeChanges,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  cloneDiagramNode,
  createDiagramNode,
  createRestResourceMethod,
  createStarterDiagram,
  touchDiagram,
} from "../domain/factories";
import {
  createAppViewComponent,
  createResourceSchemaField,
  createPsqlForeignKey,
  createRestMethodInput,
  createPsqlColumn,
  createPsqlIndex,
  DiagramModel,
} from "../domain/model";
import type {
  AppViewComponent,
  BlockData,
  BlockKind,
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
  PsqlForeignKey,
  PsqlIndex,
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

type NodeDataPatch = Partial<BlockData>;

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

export const useDiagramStore = () => {
  const [history, setHistory] = useState(() =>
    createHistory(loadDiagramCollection()),
  );
  const pendingNodeDragCollectionRef = useRef<DiagramCollection | null>(null);
  const collection = history.present;

  useEffect(() => {
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
    (kind: BlockKind, position?: { x: number; y: number }) => {
      const node = createDiagramNode(
        kind,
        position ?? {
          x: 120 + activeDiagram.nodes.length * 48,
          y: 140 + activeDiagram.nodes.length * 28,
        },
      );

      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: [...diagram.nodes, node],
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
        nodes: [
          ...diagram.nodes.map((item) => ({
            ...item,
            selected: false,
          })),
          {
            ...clonedNode,
            selected: true,
          },
        ],
      }));

      return clonedNode.id;
    },
    [updateActiveDiagram],
  );

  const deleteNode = useCallback(
    (nodeId: string) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: diagram.nodes.filter((node) => node.id !== nodeId),
        edges: diagram.edges.filter(
          (edge) => edge.source !== nodeId && edge.target !== nodeId,
        ),
      }));
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
      updateActiveDiagram((diagram) => ({
        ...diagram,
        nodes: diagram.nodes.map((node) =>
          node.id === nodeId
            ? {
                ...node,
                data: {
                  ...node.data,
                  ...patch,
                } as BlockData,
              }
            : node,
        ),
      }));
    },
    [updateActiveDiagram],
  );

  const replaceAppComponents = useCallback(
    (nodeId: string, components: AppViewComponent[]) => {
      updateNodeData(nodeId, { components } as NodeDataPatch);
    },
    [updateNodeData],
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
      updateNodeData(nodeId, { columns } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const replacePsqlForeignKeys = useCallback(
    (nodeId: string, foreignKeys: PsqlForeignKey[]) => {
      updateNodeData(nodeId, { foreignKeys } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const replacePsqlIndices = useCallback(
    (nodeId: string, indices: PsqlIndex[]) => {
      updateNodeData(nodeId, { indices } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const addPsqlIndex = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return;
      }

      replacePsqlIndices(nodeId, [...node.data.indices, createPsqlIndex()]);
    },
    [activeDiagram.nodes, replacePsqlIndices],
  );

  const addPsqlForeignKey = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return;
      }

      replacePsqlForeignKeys(nodeId, [
        ...node.data.foreignKeys,
        createPsqlForeignKey(),
      ]);
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
    (nodeId: string, methodId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "restResource") {
        return;
      }

      const method = node.data.methods.find((item) => item.id === methodId);

      if (!method) {
        return;
      }

      replaceRestMethodInputs(nodeId, methodId, [
        ...method.input,
        createRestMethodInput(),
      ]);
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
    (nodeId: string, currentSchema: ResourceSchemaField[]) => {
      replaceResourceSchema(nodeId, [
        ...currentSchema,
        createResourceSchemaField(),
      ]);
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

        const nextCollection = patchDiagram(current.present, activeDiagram.id, (diagram) => ({
          ...diagram,
          nodes: applyNodeChanges(changes, diagram.nodes) as DiagramNode[],
          edges: diagram.edges.filter(
            (edge) =>
              !changes.some(
                (change) =>
                  change.type === "remove" &&
                  (edge.source === change.id || edge.target === change.id),
              ),
          ),
        }));

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

  const addAppComponent = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "appView") {
        return;
      }

      replaceAppComponents(nodeId, [
        ...node.data.components,
        createAppViewComponent(),
      ]);
    },
    [activeDiagram.nodes, replaceAppComponents],
  );

  const addPsqlColumn = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "psqlTable") {
        return;
      }

      replacePsqlColumns(nodeId, [
        ...node.data.columns,
        createPsqlColumn(),
      ]);
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
    addAppComponent,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addRestMethodInput,
    addPsqlColumn,
    addPsqlForeignKey,
    addPsqlIndex,
    collection,
    connectNodes,
    createDiagram,
    deleteDiagram,
    deleteEdge,
    deleteNode,
    duplicateNode,
    onEdgesChange,
    onNodesChange,
    renameDiagram,
    replaceAppComponents,
    replaceResourceSchema,
    replaceRestMethodInputs,
    replaceRestMethods,
    replacePsqlColumns,
    replacePsqlForeignKeys,
    replacePsqlIndices,
    removeRestMethod,
    selectDiagram,
    canRedo: history.future.length > 0,
    canUndo: history.past.length > 0,
    redo,
    undo,
    updateEdgeData,
    updateNodeData,
    updateRestMethod,
  };
};
