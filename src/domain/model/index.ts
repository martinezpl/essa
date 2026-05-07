import type {
  BlockData,
  BlockKind,
  CanvasNodeKind,
  ConnectionKind,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeData,
  RestMethodInputField,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
  ResourceSchemaField,
  PsqlColumn,
  AnnotationData,
  PsqlEnum,
  PsqlForeignKey,
  PsqlIndex,
  PsqlTableData,
} from "../types";
import {
  connectionKindSchema,
  jsonFieldTypeSchema,
  psqlIndexMethodSchema,
  psqlColumnTypeSchema,
  restMethodKindSchema,
} from "../types";
import { createId } from "../id";
import type {
  ConnectionSpec,
  MermaidBlockSpec,
  MermaidConnectionSpec,
  OpenApiResourceSpec,
  SchemaSpec,
  PsqlTableSpec,
} from "../exportSpecs";

type Position = DiagramNode["position"];

export type ConnectionPort = {
  id: string;
  direction: "input" | "output";
  connectsTo: readonly BlockKind[];
  defaultKind: ConnectionKind;
};

type CreateBlockOptions = {
  seed?: boolean;
};

const clonePosition = (position: Position, offset = 48): Position => ({
  x: position.x + offset,
  y: position.y + offset,
});

const cloneColumns = (
  columns: PsqlColumn[],
): { columns: PsqlColumn[]; columnIdMap: Map<string, string> } => {
  const columnIdMap = new Map<string, string>();
  const clonedColumns = columns.map((column) => {
    const id = createId("column");
    columnIdMap.set(column.id, id);

    return {
      ...column,
      id,
    };
  });

  return { columns: clonedColumns, columnIdMap };
};

const cloneForeignKeys = (
  foreignKeys: PsqlForeignKey[],
  sourceTableId: string,
): PsqlForeignKey[] =>
  foreignKeys.flatMap((foreignKey) => {
    if (foreignKey.targetTableId === sourceTableId) {
      return [];
    }

    return [
      {
        ...foreignKey,
        id: createId("foreign-key"),
      },
    ];
  });

const cloneIndices = (indices: PsqlIndex[]): PsqlIndex[] =>
  indices.map((index) => ({
    ...index,
    id: createId("index"),
    columns: [...index.columns],
  }));

const cloneSchema = (schema: ResourceSchemaField[]): ResourceSchemaField[] =>
  schema.map((field) => ({
    ...field,
    id: createId("schema-field"),
  }));

const cloneMethods = (methods: RestResourceMethod[]): RestResourceMethod[] =>
  methods.map((method) => ({
    ...method,
    id: createId("method"),
    input: method.input.map((field) => ({
      ...field,
      id: createId("input"),
    })),
    output: { ...method.output },
  }));

export abstract class Block<D extends BlockData = BlockData> {
  abstract readonly kind: D["kind"];
  abstract readonly label: string;
  abstract readonly ports: readonly ConnectionPort[];
  readonly data: D;
  readonly id: string;
  readonly position: Position;
  readonly selected?: boolean;

  protected constructor(node: {
    data: D;
    id: string;
    position: Position;
    selected?: boolean;
  }) {
    this.data = node.data;
    this.id = node.id;
    this.position = node.position;
    this.selected = node.selected;
  }

  abstract clone(): Block<D>;
  abstract title(): string;

  serialize(): DiagramNode {
    const serialized: DiagramNode = {
      id: this.id,
      type: this.kind,
      position: this.position,
      data: this.data,
    };

    if (this.selected !== undefined) {
      serialized.selected = this.selected;
    }

    return serialized;
  }

  toMermaidSpec(): MermaidBlockSpec {
    return {
      id: this.id,
      kind: this.kind,
      label: this.label,
      title: this.title(),
    };
  }

  toOpenApiSpec(): OpenApiResourceSpec | null {
    return null;
  }

  toPsqlSpec(): PsqlTableSpec | null {
    return null;
  }
}

const restResourcePorts: readonly ConnectionPort[] = [
  {
    id: "table-output",
    direction: "output",
    connectsTo: ["psqlTable"],
    defaultKind: "read",
  },
];

export const createRestResourceMethodContract = (
  kind: RestMethodKind,
): RestResourceMethod => ({
  id: createId("method"),
  kind,
  input: [],
  output: {
    returnsArray: kind === "GET /",
  },
});

export const createRestMethodInput = (): RestMethodInputField => ({
  id: createId("input"),
  name: "",
  type: "string",
  mode: "payload",
});

export const createPsqlIndex = (): PsqlIndex => ({
  id: createId("index"),
  columns: [],
  method: "btree",
  unique: false,
});

export const createPsqlForeignKey = (): PsqlForeignKey => ({
  id: createId("foreign-key"),
  name: "",
  type: "uuid",
  nullable: false,
  targetTableId: "",
  targetColumnId: "",
  onDelete: "NO ACTION",
  onUpdate: "NO ACTION",
});

export const createPsqlEnum = (): PsqlEnum => ({
  id: createId("psql-enum"),
  name: "",
  values: [],
});

export class RestResourceBlock extends Block<RestResourceData> {
  readonly kind = "restResource";
  readonly label = "API";
  readonly ports = restResourcePorts;
  readonly schemaSpec: SchemaSpec = {
    allowedTypes: jsonFieldTypeSchema.options,
  };

  static createSchemaField(): ResourceSchemaField {
    return {
      id: createId("schema-field"),
      name: "",
      type: "string",
      nullable: false,
      sourceTableId: "",
      sourceColumnId: "",
    };
  }

  static blankData(): RestResourceData {
    return {
      kind: "restResource",
      resourceName: "",
      description: "",
      methods: [],
      schema: [],
    };
  }

  static seededData(): RestResourceData {
    return {
      kind: "restResource",
      resourceName: "items",
      description: "",
      methods: [
        createRestResourceMethodContract("POST /"),
        createRestResourceMethodContract("GET /"),
        createRestResourceMethodContract("GET /{id}"),
      ],
      schema: [],
    };
  }

  static create(position: Position, options: CreateBlockOptions = {}) {
    return new RestResourceBlock({
      id: createId("node"),
      position,
      data: options.seed
        ? RestResourceBlock.seededData()
        : RestResourceBlock.blankData(),
    });
  }

  static hydrate(node: DiagramNode) {
    if (node.data.kind !== "restResource") {
      throw new Error(`Cannot hydrate ${node.data.kind} as restResource`);
    }

    return new RestResourceBlock({
      id: node.id,
      position: node.position,
      selected: node.selected,
      data: node.data,
    });
  }

  clone() {
    return new RestResourceBlock({
      id: createId("node"),
      position: clonePosition(this.position),
      data: {
        ...this.data,
        methods: cloneMethods(this.data.methods),
        schema: cloneSchema(this.data.schema),
      },
    });
  }

  title() {
    return this.data.resourceName ? `/${this.data.resourceName}` : "resource";
  }

  toOpenApiSpec(): OpenApiResourceSpec {
    return {
      id: this.id,
      resourceName: this.data.resourceName,
      methods: this.data.methods,
      schema: this.data.schema,
    };
  }
}

const psqlTablePorts: readonly ConnectionPort[] = [
  {
    id: "resource-input",
    direction: "input",
    connectsTo: ["restResource"],
    defaultKind: "read",
  },
];

export class PsqlTableBlock extends Block<PsqlTableData> {
  readonly kind = "psqlTable";
  readonly label = "PSQL Table";
  readonly ports = psqlTablePorts;
  readonly schemaSpec: SchemaSpec = {
    allowedTypes: psqlColumnTypeSchema.options,
  };

  static createColumn(): PsqlColumn {
    return {
      id: createId("column"),
      name: "",
      type: "text",
      nullable: false,
      unique: false,
    };
  }

  static blankData(): PsqlTableData {
    const idColumnId = createId("column");
    return {
      kind: "psqlTable",
      tableName: "",
      primaryKey: [idColumnId],
      columns: [
        {
          id: idColumnId,
          name: "id",
          type: "uuid",
          nullable: false,
          defaultValue: "get_random_uuid()",
          unique: false,
        },
      ],
      foreignKeys: [],
      indices: [],
    };
  }

  static seededData(): PsqlTableData {
    const idColumnId = createId("column");
    return {
      kind: "psqlTable",
      tableName: "items",
      primaryKey: [idColumnId],
      columns: [
        {
          id: idColumnId,
          name: "id",
          type: "uuid",
          nullable: false,
          defaultValue: "get_random_uuid()",
          unique: false,
        },
        {
          id: createId("column"),
          name: "name",
          type: "text",
          nullable: false,
          unique: false,
        },
      ],
      foreignKeys: [],
      indices: [],
    };
  }

  static create(position: Position, options: CreateBlockOptions = {}) {
    return new PsqlTableBlock({
      id: createId("node"),
      position,
      data: options.seed ? PsqlTableBlock.seededData() : PsqlTableBlock.blankData(),
    });
  }

  static hydrate(node: DiagramNode) {
    if (node.data.kind !== "psqlTable") {
      throw new Error(`Cannot hydrate ${node.data.kind} as psqlTable`);
    }

    return new PsqlTableBlock({
      id: node.id,
      position: node.position,
      selected: node.selected,
      data: node.data,
    });
  }

  clone() {
    const { columns, columnIdMap } = cloneColumns(this.data.columns);
    const foreignKeys = cloneForeignKeys(this.data.foreignKeys, this.id);

    const fkIdMap = new Map<string, string>();
    let fkCloneIndex = 0;
    for (const originalFk of this.data.foreignKeys) {
      if (originalFk.targetTableId !== this.id) {
        const clonedFk = foreignKeys[fkCloneIndex];
        if (clonedFk) fkIdMap.set(originalFk.id, clonedFk.id);
        fkCloneIndex++;
      }
    }

    const primaryKey = this.data.primaryKey.flatMap((id) => {
      const newId = columnIdMap.get(id) ?? fkIdMap.get(id);
      return newId ? [newId] : [];
    });

    return new PsqlTableBlock({
      id: createId("node"),
      position: clonePosition(this.position),
      data: {
        ...this.data,
        primaryKey,
        columns,
        foreignKeys,
        indices: cloneIndices(this.data.indices),
      },
    });
  }

  title() {
    return this.data.tableName || "PSQL table";
  }

  toPsqlSpec(): PsqlTableSpec {
    return {
      id: this.id,
      tableName: this.data.tableName,
      primaryKey: this.data.primaryKey,
      columns: this.data.columns,
      foreignKeys: this.data.foreignKeys,
      indices: this.data.indices,
    };
  }
}

export class AnnotationCanvasItem {
  readonly kind = "annotation";
  readonly label = "Annotation";
  readonly data: AnnotationData;
  readonly id: string;
  readonly position: Position;
  readonly selected?: boolean;

  private constructor(node: {
    data: AnnotationData;
    id: string;
    position: Position;
    selected?: boolean;
  }) {
    this.data = node.data;
    this.id = node.id;
    this.position = node.position;
    this.selected = node.selected;
  }

  static blankData(): AnnotationData {
    return {
      kind: "annotation",
      label: "Group",
      color: "#818cf8",
      width: 520,
      height: 320,
    };
  }

  static create(position: Position) {
    return new AnnotationCanvasItem({
      id: createId("node"),
      position,
      data: AnnotationCanvasItem.blankData(),
    });
  }

  static hydrate(node: DiagramNode) {
    if (node.data.kind !== "annotation") {
      throw new Error(`Cannot hydrate ${node.data.kind} as annotation`);
    }

    return new AnnotationCanvasItem({
      id: node.id,
      position: node.position,
      selected: node.selected,
      data: node.data,
    });
  }

  clone() {
    return new AnnotationCanvasItem({
      id: createId("node"),
      position: clonePosition(this.position),
      data: { ...this.data },
    });
  }

  title() {
    return this.data.label || "annotation";
  }

  serialize(): DiagramNode {
    const serialized: DiagramNode = {
      id: this.id,
      type: this.kind,
      position: this.position,
      data: this.data,
    };

    if (this.selected !== undefined) {
      serialized.selected = this.selected;
    }

    return serialized;
  }
}

export type AnyBlock = RestResourceBlock | PsqlTableBlock;
export type AnyCanvasNode = AnyBlock | AnnotationCanvasItem;

export type BlockDefinition<B extends AnyBlock = AnyBlock> = {
  kind: B["kind"];
  label: string;
  ports: B["ports"];
  schemaSpec?: SchemaSpec;
  create: (position: Position, options?: CreateBlockOptions) => B;
  hydrate: (node: DiagramNode) => B;
  title: (data: B["data"]) => string;
};

export const blockDefinitions = {
  restResource: {
    kind: "restResource",
    label: "API",
    ports: restResourcePorts,
    schemaSpec: { allowedTypes: jsonFieldTypeSchema.options },
    create: RestResourceBlock.create,
    hydrate: RestResourceBlock.hydrate,
    title: (data: RestResourceData) =>
      data.resourceName ? `/${data.resourceName}` : "resource",
  },
  psqlTable: {
    kind: "psqlTable",
    label: "PSQL Table",
    ports: psqlTablePorts,
    schemaSpec: { allowedTypes: psqlColumnTypeSchema.options },
    create: PsqlTableBlock.create,
    hydrate: PsqlTableBlock.hydrate,
    title: (data: PsqlTableData) => data.tableName || "PSQL table",
  },
} satisfies {
  [K in BlockKind]: BlockDefinition<Extract<AnyBlock, { kind: K }>>;
};

export const blockList = Object.values(blockDefinitions);
export const annotationDefinition = {
  kind: "annotation",
  label: "Annotation",
  create: AnnotationCanvasItem.create,
  hydrate: AnnotationCanvasItem.hydrate,
  title: (data: AnnotationData) => data.label || "annotation",
};
export const canvasNodeDefinitions = {
  ...blockDefinitions,
  annotation: annotationDefinition,
};
export const connectionKinds = connectionKindSchema.options;
export const restMethodKinds = restMethodKindSchema.options;
export const psqlColumnTypes = psqlColumnTypeSchema.options;
export const psqlIndexMethods = psqlIndexMethodSchema.options;
export const jsonFieldTypes = jsonFieldTypeSchema.options;
export const restMethodInputModes = ["payload", "query"] as const;
export const createResourceSchemaField = () =>
  RestResourceBlock.createSchemaField();
export const createPsqlColumn = () => PsqlTableBlock.createColumn();

export const createBlock = (
  kind: BlockKind,
  position: Position,
  options?: CreateBlockOptions,
): AnyBlock => blockDefinitions[kind].create(position, options);

export const createCanvasNode = (
  kind: CanvasNodeKind,
  position: Position,
  options?: CreateBlockOptions,
): AnyCanvasNode =>
  kind === "annotation"
    ? AnnotationCanvasItem.create(position)
    : createBlock(kind, position, options);

export const hydrateBlock = (node: DiagramNode): AnyBlock =>
  node.data.kind === "annotation"
    ? (() => {
        throw new Error("Cannot hydrate annotation as a block");
      })()
    : blockDefinitions[node.data.kind].hydrate(node);

export const hydrateCanvasNode = (node: DiagramNode): AnyCanvasNode =>
  node.data.kind === "annotation"
    ? AnnotationCanvasItem.hydrate(node)
    : hydrateBlock(node);

export const getBlockTitle = (node: DiagramNode) =>
  node.data.kind === "annotation"
    ? (() => {
        throw new Error("Cannot get block title for annotation");
      })()
    : blockDefinitions[node.data.kind].title(node.data as never);

export const getCanvasNodeTitle = (node: DiagramNode) =>
  node.data.kind === "annotation"
    ? annotationDefinition.title(node.data)
    : getBlockTitle(node);

export class Connection {
  readonly data: EdgeData;
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly type?: string;

  constructor(edge: DiagramEdge) {
    this.id = edge.id;
    this.sourceId = edge.source;
    this.targetId = edge.target;
    this.type = edge.type;
    this.data = edge.data;
  }

  static create(source: AnyBlock, target: AnyBlock) {
    const kind = getCompatibleConnectionKind(source, target);

    if (!kind) {
      return null;
    }

    return new Connection({
      id: createId("edge"),
      source: source.id,
      target: target.id,
      type: "smoothstep",
      data: { kind, dataPath: "all" },
    });
  }

  clone(nextIds: { sourceId?: string; targetId?: string } = {}) {
    return new Connection({
      id: createId("edge"),
      source: nextIds.sourceId ?? this.sourceId,
      target: nextIds.targetId ?? this.targetId,
      type: this.type,
      data: {
        ...this.data,
      },
    });
  }

  serialize(): DiagramEdge {
    return {
      id: this.id,
      source: this.sourceId,
      target: this.targetId,
      type: this.type,
      data: this.data,
    };
  }

  toConnectionSpec(): ConnectionSpec {
    return {
      kind: this.data.kind,
      dataPath: this.data.dataPath,
    };
  }

  toMermaidSpec(): MermaidConnectionSpec {
    return {
      id: this.id,
      sourceId: this.sourceId,
      targetId: this.targetId,
      label: `${this.data.kind}: ${this.data.dataPath || "all"}`,
    };
  }
}

export const hydrateConnection = (edge: DiagramEdge) => new Connection(edge);

export const getCompatibleConnectionKind = (
  source?: AnyBlock,
  target?: AnyBlock,
): ConnectionKind | null => {
  if (!source || !target || source.id === target.id) {
    return null;
  }

  const sourcePort = source.ports.find(
    (port) =>
      port.direction === "output" && port.connectsTo.includes(target.kind),
  );
  const targetPort = target.ports.find(
    (port) =>
      port.direction === "input" && port.connectsTo.includes(source.kind),
  );

  if (!sourcePort || !targetPort) {
    return null;
  }

  return sourcePort.defaultKind;
};

export const getCompatibleConnectionKinds = (
  source?: AnyBlock,
  target?: AnyBlock,
): ConnectionKind[] => {
  if (!source || !target || source.id === target.id) {
    return [];
  }

  const targetAcceptsSource = target.ports.some(
    (port) =>
      port.direction === "input" && port.connectsTo.includes(source.kind),
  );

  if (!targetAcceptsSource) {
    return [];
  }

  const hasCompatibleSourcePort = source.ports.some(
    (port) =>
      port.direction === "output" && port.connectsTo.includes(target.kind),
  );

  return hasCompatibleSourcePort ? Array.from(connectionKinds) : [];
};

export class DiagramModel {
  readonly connections: readonly Connection[];
  readonly diagram: Diagram;
  readonly blocks: readonly AnyBlock[];

  constructor(diagram: Diagram) {
    this.diagram = diagram;
    this.blocks = diagram.nodes.flatMap((node) =>
      node.data.kind === "annotation" ? [] : [hydrateBlock(node)],
    );
    this.connections = diagram.edges.map(hydrateConnection);
  }

  static hydrate(diagram: Diagram) {
    return new DiagramModel(diagram);
  }

  getBlock(blockId: string) {
    return this.blocks.find((block) => block.id === blockId);
  }

  hasDuplicateConnection(sourceId: string, targetId: string) {
    return this.connections.some(
      (connection) =>
        connection.sourceId === sourceId && connection.targetId === targetId,
    );
  }

  createConnection(sourceId?: string | null, targetId?: string | null) {
    if (!sourceId || !targetId || this.hasDuplicateConnection(sourceId, targetId)) {
      return null;
    }

    const source = this.getBlock(sourceId);
    const target = this.getBlock(targetId);

    if (!source || !target) {
      return null;
    }

    return Connection.create(source, target);
  }

  duplicateBlock(blockId: string) {
    return this.getBlock(blockId)?.clone() ?? null;
  }

  serialize(): Diagram {
    return {
      ...this.diagram,
      nodes: this.diagram.nodes.map(
        (node) => this.getBlock(node.id)?.serialize() ?? node,
      ),
      edges: this.connections.map((connection) => connection.serialize()),
    };
  }

  toMermaidSpecs() {
    return {
      blocks: this.blocks.map((block) => block.toMermaidSpec()),
      connections: this.connections.map((connection) =>
        connection.toMermaidSpec(),
      ),
    };
  }

  toOpenApiSpecs() {
    return this.blocks.flatMap((block) => block.toOpenApiSpec() ?? []);
  }

  toPsqlSpecs() {
    return this.blocks.flatMap((block) => block.toPsqlSpec() ?? []);
  }
}

export const hydrateDiagram = (diagram: Diagram) => DiagramModel.hydrate(diagram);

export const serializeDiagram = (model: DiagramModel) => model.serialize();
