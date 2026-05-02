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
  PsqlColumnOptions,
  PsqlEnum,
  PsqlForeignKey,
  PsqlIndex,
} from "../domain/types";

export type DiagramContextValue = {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  psqlEnums: PsqlEnum[];
  resourceSchemas: Map<string, ResourceSchemaField[]>;
  onAddResourceSchemaField: (
    nodeId: string,
    currentSchema: ResourceSchemaField[],
  ) => string;
  onAddRestMethod: (nodeId: string, kind: RestMethodKind) => void;
  onAddRestMethodInput: (nodeId: string, methodId: string) => string | null;
  onAddPsqlColumn: (nodeId: string) => string | null;
  onAddPsqlEnum: () => string;
  onAddPsqlForeignKey: (nodeId: string) => string | null;
  onAddPsqlIndex: (nodeId: string) => string | null;
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
  onReplacePsqlEnums: (enums: PsqlEnum[]) => void;
  onReplacePsqlForeignKeys: (nodeId: string, foreignKeys: PsqlForeignKey[]) => void;
  onReplacePsqlIndices: (nodeId: string, indices: PsqlIndex[]) => void;
  onRemoveRestMethod: (nodeId: string, methodId: string) => void;
  onUpdateEdgeData: (edgeId: string, patch: Partial<EdgeData>) => void;
  onUpdateNodeData: (nodeId: string, patch: Partial<BlockData>) => void;
  onUpdatePsqlColumnOptions: (
    nodeId: string,
    columnId: string,
    options: PsqlColumnOptions | undefined,
  ) => void;
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
