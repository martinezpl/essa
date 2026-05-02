import type {
  AppViewData,
  BlockData,
  BlockKind,
  ConnectionKind,
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeData,
  RestMethodKind,
  RestResourceData,
  RestResourceMethod,
  ResourceSchemaField,
  SqlColumn,
  SqlIndex,
  SqlTableData,
} from "../types";
import {
  jsonFieldTypeSchema,
  postgresTypeSchema,
  restMethodKindSchema,
} from "../types";
import { createId } from "../id";
import type {
  AppViewSpec,
  ConnectionSpec,
  MermaidBlockSpec,
  MermaidConnectionSpec,
  OpenApiResourceSpec,
  SchemaSpec,
  SqlTableSpec,
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

const cloneComponents = (
  components: AppViewData["components"],
): AppViewData["components"] =>
  components.map((component) => ({
    ...component,
    id: createId("component"),
    dataUsage: component.dataUsage ? { ...component.dataUsage } : undefined,
  }));

const cloneColumns = (columns: SqlColumn[]): SqlColumn[] =>
  columns.map((column) => ({
    ...column,
    id: createId("column"),
  }));

const cloneIndices = (indices: SqlIndex[]): SqlIndex[] =>
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
    input: method.input
      ? {
          ...method.input,
          fields: [...method.input.fields],
        }
      : undefined,
    output: {
      ...method.output,
      fields: [...method.output.fields],
    },
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

  toAppViewSpec(): AppViewSpec | null {
    return null;
  }

  toOpenApiSpec(): OpenApiResourceSpec | null {
    return null;
  }

  toSqlSpec(): SqlTableSpec | null {
    return null;
  }
}

const appViewPorts: readonly ConnectionPort[] = [
  {
    id: "resource-output",
    direction: "output",
    connectsTo: ["restResource"],
    defaultKind: "read",
  },
];

export class AppViewBlock extends Block<AppViewData> {
  readonly kind = "appView";
  readonly label = "App View";
  readonly ports = appViewPorts;

  static blankData(): AppViewData {
    return {
      kind: "appView",
      route: "",
      components: [],
    };
  }

  static seededData(): AppViewData {
    return {
      kind: "appView",
      route: "/dashboard",
      components: [
        {
          id: createId("component"),
          name: "Results List",
        },
      ],
    };
  }

  static create(position: Position, options: CreateBlockOptions = {}) {
    return new AppViewBlock({
      id: createId("node"),
      position,
      data: options.seed ? AppViewBlock.seededData() : AppViewBlock.blankData(),
    });
  }

  static hydrate(node: DiagramNode) {
    if (node.data.kind !== "appView") {
      throw new Error(`Cannot hydrate ${node.data.kind} as appView`);
    }

    return new AppViewBlock({
      id: node.id,
      position: node.position,
      selected: node.selected,
      data: node.data,
    });
  }

  clone() {
    return new AppViewBlock({
      id: createId("node"),
      position: clonePosition(this.position),
      data: {
        ...this.data,
        components: cloneComponents(this.data.components),
      },
    });
  }

  title() {
    return this.data.route || "App view";
  }

  toAppViewSpec(): AppViewSpec {
    return {
      id: this.id,
      route: this.data.route,
      components: this.data.components,
    };
  }
}

const restResourcePorts: readonly ConnectionPort[] = [
  {
    id: "view-input",
    direction: "input",
    connectsTo: ["appView", "sqlTable"],
    defaultKind: "read",
  },
  {
    id: "table-output",
    direction: "output",
    connectsTo: ["sqlTable"],
    defaultKind: "read",
  },
];

export const createRestResourceMethodContract = (
  kind: RestMethodKind,
): RestResourceMethod => ({
  id: createId("method"),
  kind,
  input:
    kind === "POST /" || kind === "PATCH /{id}"
      ? { mode: "payload", fields: ["all"] }
      : kind === "GET /"
        ? { mode: "query", fields: [] }
        : undefined,
  output: {
    fields: kind === "DELETE /{id}" ? [] : ["all"],
    returnsArray: kind === "GET /",
  },
});

export class RestResourceBlock extends Block<RestResourceData> {
  readonly kind = "restResource";
  readonly label = "Resource";
  readonly ports = restResourcePorts;
  readonly schemaSpec: SchemaSpec = {
    allowedTypes: jsonFieldTypeSchema.options,
  };

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

const sqlTablePorts: readonly ConnectionPort[] = [
  {
    id: "resource-input",
    direction: "input",
    connectsTo: ["restResource"],
    defaultKind: "read",
  },
  {
    id: "resource-output",
    direction: "output",
    connectsTo: ["restResource"],
    defaultKind: "write",
  },
];

export class SqlTableBlock extends Block<SqlTableData> {
  readonly kind = "sqlTable";
  readonly label = "SQL Table";
  readonly ports = sqlTablePorts;
  readonly schemaSpec: SchemaSpec = {
    allowedTypes: postgresTypeSchema.options,
  };

  static blankData(): SqlTableData {
    return {
      kind: "sqlTable",
      tableName: "",
      columns: [
        {
          id: createId("column"),
          name: "",
          type: "uuid",
          nullable: false,
          primaryKey: true,
        },
      ],
      indices: [],
    };
  }

  static seededData(): SqlTableData {
    return {
      kind: "sqlTable",
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
      indices: [],
    };
  }

  static create(position: Position, options: CreateBlockOptions = {}) {
    return new SqlTableBlock({
      id: createId("node"),
      position,
      data: options.seed ? SqlTableBlock.seededData() : SqlTableBlock.blankData(),
    });
  }

  static hydrate(node: DiagramNode) {
    if (node.data.kind !== "sqlTable") {
      throw new Error(`Cannot hydrate ${node.data.kind} as sqlTable`);
    }

    return new SqlTableBlock({
      id: node.id,
      position: node.position,
      selected: node.selected,
      data: node.data,
    });
  }

  clone() {
    return new SqlTableBlock({
      id: createId("node"),
      position: clonePosition(this.position),
      data: {
        ...this.data,
        columns: cloneColumns(this.data.columns),
        indices: cloneIndices(this.data.indices),
      },
    });
  }

  title() {
    return this.data.tableName || "SQL table";
  }

  toSqlSpec(): SqlTableSpec {
    return {
      id: this.id,
      tableName: this.data.tableName,
      columns: this.data.columns,
      indices: this.data.indices,
    };
  }
}

export type AnyBlock = AppViewBlock | RestResourceBlock | SqlTableBlock;

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
  appView: {
    kind: "appView",
    label: "App View",
    ports: appViewPorts,
    create: AppViewBlock.create,
    hydrate: AppViewBlock.hydrate,
    title: (data: AppViewData) => data.route || "App view",
  },
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
  sqlTable: {
    kind: "sqlTable",
    label: "SQL Table",
    ports: sqlTablePorts,
    schemaSpec: { allowedTypes: postgresTypeSchema.options },
    create: SqlTableBlock.create,
    hydrate: SqlTableBlock.hydrate,
    title: (data: SqlTableData) => data.tableName || "SQL table",
  },
} satisfies {
  [K in BlockKind]: BlockDefinition<Extract<AnyBlock, { kind: K }>>;
};

export const blockList = Object.values(blockDefinitions);
export const restMethodKinds = restMethodKindSchema.options;
export const postgresTypes = postgresTypeSchema.options;
export const jsonFieldTypes = jsonFieldTypeSchema.options;

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

  toSqlSpecs() {
    return this.blocks.flatMap((block) => block.toSqlSpec() ?? []);
  }
}

export const hydrateDiagram = (diagram: Diagram) => DiagramModel.hydrate(diagram);

export const serializeDiagram = (model: DiagramModel) => model.serialize();
