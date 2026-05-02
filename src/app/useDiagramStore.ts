import { useCallback, useEffect, useMemo, useState } from "react";
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
  createRestMethodInput,
  createSqlColumn,
  createSqlIndex,
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
  SqlColumn,
  SqlIndex,
} from "../domain/types";
import {
  createInitialCollection,
  loadDiagramCollection,
  saveDiagramCollection,
} from "../storage/diagramStorage";

type NodeDataPatch = Partial<BlockData>;

const patchDiagram = (
  collection: DiagramCollection,
  diagramId: string,
  updater: (diagram: Diagram) => Diagram,
): DiagramCollection => ({
  ...collection,
  activeDiagramId: diagramId,
  diagrams: collection.diagrams.map((diagram) =>
    diagram.id === diagramId ? touchDiagram(updater(diagram)) : diagram,
  ),
});

export const useDiagramStore = () => {
  const [collection, setCollection] = useState<DiagramCollection>(() => loadDiagramCollection());

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
      setCollection((current) => patchDiagram(current, activeDiagram.id, updater));
    },
    [activeDiagram.id],
  );

  const selectDiagram = useCallback((diagramId: string) => {
    setCollection((current) => ({
      ...current,
      activeDiagramId: diagramId,
    }));
  }, []);

  const createDiagram = useCallback(() => {
    const diagram = createStarterDiagram();
    diagram.name = `Diagram ${collection.diagrams.length + 1}`;

    setCollection((current) => ({
      ...current,
      activeDiagramId: diagram.id,
      diagrams: [...current.diagrams, diagram],
    }));
  }, [collection.diagrams.length]);

  const renameDiagram = useCallback((diagramId: string, name: string) => {
    const trimmedName = name.trim();

    if (!trimmedName) {
      return;
    }

    setCollection((current) =>
      patchDiagram(current, diagramId, (diagram) => ({
        ...diagram,
        name: trimmedName,
      })),
    );
  }, []);

  const deleteDiagram = useCallback((diagramId: string) => {
    setCollection((current) => {
      if (current.diagrams.length === 1) {
        return createInitialCollection();
      }

      const diagrams = current.diagrams.filter((diagram) => diagram.id !== diagramId);

      return {
        ...current,
        diagrams,
        activeDiagramId:
          current.activeDiagramId === diagramId ? diagrams[0].id : current.activeDiagramId,
      };
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

  const replaceSqlColumns = useCallback(
    (nodeId: string, columns: SqlColumn[]) => {
      updateNodeData(nodeId, { columns } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const replaceSqlIndices = useCallback(
    (nodeId: string, indices: SqlIndex[]) => {
      updateNodeData(nodeId, { indices } as NodeDataPatch);
    },
    [updateNodeData],
  );

  const addSqlIndex = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "sqlTable") {
        return;
      }

      replaceSqlIndices(nodeId, [...node.data.indices, createSqlIndex()]);
    },
    [activeDiagram.nodes, replaceSqlIndices],
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
      updateActiveDiagram((diagram) => ({
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
    },
    [updateActiveDiagram],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<DiagramEdge>[]) => {
      updateActiveDiagram((diagram) => ({
        ...diagram,
        edges: applyEdgeChanges(changes, diagram.edges) as DiagramEdge[],
      }));
    },
    [updateActiveDiagram],
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

  const addSqlColumn = useCallback(
    (nodeId: string) => {
      const node = activeDiagram.nodes.find((item) => item.id === nodeId);

      if (node?.data.kind !== "sqlTable") {
        return;
      }

      replaceSqlColumns(nodeId, [
        ...node.data.columns,
        createSqlColumn(),
      ]);
    },
    [activeDiagram.nodes, replaceSqlColumns],
  );

  return {
    activeDiagram,
    addAppComponent,
    addNode,
    addResourceSchemaField,
    addRestMethod,
    addRestMethodInput,
    addSqlColumn,
    addSqlIndex,
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
    replaceSqlColumns,
    replaceSqlIndices,
    removeRestMethod,
    selectDiagram,
    updateEdgeData,
    updateNodeData,
    updateRestMethod,
  };
};
