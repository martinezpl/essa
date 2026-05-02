import { createContext, useContext, type ReactNode } from "react";
import type {
  AppViewComponent,
  BlockData,
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

export type DiagramContextValue = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  resourceSchemas: Map<string, ResourceSchemaField[]>;
  onAddAppComponent: (nodeId: string) => void;
  onAddResourceSchemaField: (
    nodeId: string,
    currentSchema: ResourceSchemaField[],
  ) => void;
  onAddRestMethod: (nodeId: string, kind: RestMethodKind) => void;
  onAddRestMethodInput: (nodeId: string, methodId: string) => void;
  onAddSqlColumn: (nodeId: string) => void;
  onAddSqlIndex: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onReplaceAppComponents: (
    nodeId: string,
    components: AppViewComponent[],
  ) => void;
  onReplaceResourceSchema: (
    nodeId: string,
    schema: ResourceSchemaField[],
  ) => void;
  onReplaceRestMethodInputs: (
    nodeId: string,
    methodId: string,
    inputs: RestMethodInputField[],
  ) => void;
  onReplaceSqlColumns: (nodeId: string, columns: SqlColumn[]) => void;
  onReplaceSqlIndices: (nodeId: string, indices: SqlIndex[]) => void;
  onRemoveRestMethod: (nodeId: string, methodId: string) => void;
  onUpdateEdgeData: (edgeId: string, patch: Partial<EdgeData>) => void;
  onUpdateNodeData: (nodeId: string, patch: Partial<BlockData>) => void;
  onUpdateRestMethod: (
    nodeId: string,
    methodId: string,
    updater: (method: RestResourceMethod) => RestResourceMethod,
  ) => void;
};

const DiagramContext = createContext<DiagramContextValue | null>(null);

type DiagramProviderProps = {
  value: DiagramContextValue;
  children: ReactNode;
};

export const DiagramProvider = ({ value, children }: DiagramProviderProps) => (
  <DiagramContext.Provider value={value}>{children}</DiagramContext.Provider>
);

export const useDiagramContext = () => {
  const value = useContext(DiagramContext);

  if (!value) {
    throw new Error("useDiagramContext must be used inside a DiagramProvider");
  }

  return value;
};
