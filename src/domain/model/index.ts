import type {
  BlockData,
  BlockKind,
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
  PsqlEnum,
  PsqlForeignKey,
  PsqlIndex,
  PsqlTableData,
} from "../types";
import {
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
  name: "",
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
});

export const createPsqlEnum = (): PsqlEnum => ({
  id: createId("psql-enum"),
  name: "",
  values: [],
});

export class RestResourceBlock extends Block<RestResourceData> {
  readonly kind = "restResource";
  readonly label = "Resource";
  readonly ports = restResourcePorts;
  readonly schemaSpec: SchemaSpec = {
    allowedTypes: jsonFieldTypeSchema.options,
  };

  static createSchemaField(): ResourceSchemaField {
    return {
      id: createId("schema-field"),
      name: "",
      type: "string",
      nullable: true,
      sourceTableId: "",
      sourceColumnId: "",
    };
  }

  static blankData(): RestResourceData {
    return {
      kind: "restResource",
      resourceName: "",
      methods: [],
      schema: [],
    };
  }

  static seededData(): RestResourceData {
    return {
      kind: "restResource",
      resourceName: "items",
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
      primaryKey: false,
    };
  }

  static blankData(): PsqlTableData {
    return {
      kind: "psqlTable",
      tableName: "",
      columns: [
        {
          id: createId("column"),
          name: "id",
          type: "uuid",
          nullable: false,
          primaryKey: true,
        },
      ],
      foreignKeys: [],
      indices: [],
    };
  }

  static seededData(): PsqlTableData {
    return {
      kind: "psqlTable",
      tableName: "items",
      columns: [
        {
          id: createId("column"),
          name: "id",
          type: "uuid",
          nullable: false,
          primaryKey: true,
        },
        {
          id: createId("column"),
          name: "name",
          type: "text",
          nullable: false,
          primaryKey: false,
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
    const { columns } = cloneColumns(this.data.columns);

    return new PsqlTableBlock({
      id: createId("node"),
      position: clonePosition(this.position),
      data: {
        ...this.data,
        columns,
        foreignKeys: cloneForeignKeys(this.data.foreignKeys, this.id),
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
      columns: this.data.columns,
      foreignKeys: this.data.foreignKeys,
      indices: this.data.indices,
    };
  }
}

export type AnyBlock = RestResourceBlock | PsqlTableBlock;

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
    label: "Resource",
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

export const hydrateBlock = (node: DiagramNode): AnyBlock =>
  blockDefinitions[node.data.kind].hydrate(node);

export const getBlockTitle = (node: DiagramNode) =>
  blockDefinitions[node.data.kind].title(node.data as never);

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

  return [
    ...new Set(
      source.ports
        .filter(
          (port) =>
            port.direction === "output" &&
            port.connectsTo.includes(target.kind),
        )
        .map((port) => port.defaultKind),
    ),
  ];
};

export class DiagramModel {
  readonly connections: readonly Connection[];
  readonly diagram: Diagram;
  readonly blocks: readonly AnyBlock[];

  constructor(diagram: Diagram) {
    this.diagram = diagram;
    this.blocks = diagram.nodes.map(hydrateBlock);
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
      nodes: this.blocks.map((block) => block.serialize()),
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
