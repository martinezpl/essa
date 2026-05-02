import { createContext, useContext, type ReactNode } from "react";
import type {
  BlockData,
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

export type DiagramContextValue = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  resourceSchemas: Map<string, ResourceSchemaField[]>;
  onAddResourceSchemaField: (
    nodeId: string,
    currentSchema: ResourceSchemaField[],
  ) => void;
  onAddRestMethod: (nodeId: string, kind: RestMethodKind) => void;
  onAddRestMethodInput: (nodeId: string, methodId: string) => void;
  onAddPsqlColumn: (nodeId: string) => void;
  onAddPsqlForeignKey: (nodeId: string) => void;
  onAddPsqlIndex: (nodeId: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onReplaceResourceSchema: (
    nodeId: string,
    schema: ResourceSchemaField[],
  ) => void;
  onReplaceRestMethodInputs: (
    nodeId: string,
    methodId: string,
    inputs: RestMethodInputField[],
  ) => void;
  onReplacePsqlColumns: (nodeId: string, columns: PsqlColumn[]) => void;
  onReplacePsqlForeignKeys: (nodeId: string, foreignKeys: PsqlForeignKey[]) => void;
  onReplacePsqlIndices: (nodeId: string, indices: PsqlIndex[]) => void;
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
