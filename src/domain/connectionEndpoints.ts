import type {
  ConnectionKind,
  DiagramNode,
  RestMethodKind,
  RestResourceMethod,
} from "./types";

const APP_VIEW_INPUT_HANDLE_ID = "app-view-input";
const APP_VIEW_INPUT_LEGACY_HANDLE_ID = "view-input";
const APP_VIEW_ON_LOAD_SOURCE_HANDLE_ID = "app-view-on-load-source";
const APP_VIEW_EVENT_SOURCE_HANDLE_PREFIX = "app-view-event-source-";
const REST_METHOD_SOURCE_HANDLE_PREFIX = "rest-method-source-";
const REST_METHOD_TARGET_HANDLE_PREFIX = "rest-method-target-";
const PSQL_TABLE_INPUT_HANDLE_ID = "psql-table-input";
const PSQL_TABLE_INPUT_LEGACY_HANDLE_ID = "resource-input";
const WILDCARD_INPUT_HANDLE_ID = "wildcard-input";
const WILDCARD_OUTPUT_HANDLE_ID = "wildcard-output";

type ConnectableNode = Pick<DiagramNode, "id" | "data">;

export type ConnectionEndpointDirection = "input" | "output";
export type ConnectionEndpointOwnerKind =
  | "appView"
  | "appViewLifecycle"
  | "appViewEvent"
  | "restMethod"
  | "psqlTable"
  | "wildcard";

export type ConnectionEndpoint = {
  id: string;
  nodeId: string;
  handleId: string;
  ownerId?: string;
  ownerKind: ConnectionEndpointOwnerKind;
  direction: ConnectionEndpointDirection;
  label: string;
};

export const appViewInputHandleId = () => APP_VIEW_INPUT_HANDLE_ID;

export const appViewOnLoadSourceHandleId = () =>
  APP_VIEW_ON_LOAD_SOURCE_HANDLE_ID;

export const appViewEventSourceHandleId = (eventId: string) =>
  `${APP_VIEW_EVENT_SOURCE_HANDLE_PREFIX}${eventId}`;

export const restMethodSourceHandleId = (methodId: string) =>
  `${REST_METHOD_SOURCE_HANDLE_PREFIX}${methodId}`;

export const restMethodTargetHandleId = (methodId: string) =>
  `${REST_METHOD_TARGET_HANDLE_PREFIX}${methodId}`;

export const psqlTableInputHandleId = () => PSQL_TABLE_INPUT_HANDLE_ID;

export const wildcardInputHandleId = () => WILDCARD_INPUT_HANDLE_ID;

export const wildcardOutputHandleId = () => WILDCARD_OUTPUT_HANDLE_ID;

const endpointId = (
  nodeId: string,
  direction: ConnectionEndpointDirection,
  handleId: string,
) => `${nodeId}:${direction}:${handleId}`;

export const isAppViewOnLoadSourceHandleId = (handleId?: string | null) =>
  handleId === APP_VIEW_ON_LOAD_SOURCE_HANDLE_ID;

export const parseAppViewEventSourceHandleId = (
  handleId?: string | null,
) =>
  handleId?.startsWith(APP_VIEW_EVENT_SOURCE_HANDLE_PREFIX)
    ? handleId.slice(APP_VIEW_EVENT_SOURCE_HANDLE_PREFIX.length)
    : null;

export const parseRestMethodSourceHandleId = (handleId?: string | null) =>
  handleId?.startsWith(REST_METHOD_SOURCE_HANDLE_PREFIX)
    ? handleId.slice(REST_METHOD_SOURCE_HANDLE_PREFIX.length)
    : null;

export const parseRestMethodTargetHandleId = (handleId?: string | null) =>
  handleId?.startsWith(REST_METHOD_TARGET_HANDLE_PREFIX)
    ? handleId.slice(REST_METHOD_TARGET_HANDLE_PREFIX.length)
    : null;

const isAppViewInputHandleId = (handleId?: string | null) =>
  handleId === APP_VIEW_INPUT_HANDLE_ID ||
  handleId === APP_VIEW_INPUT_LEGACY_HANDLE_ID;

const isPsqlTableInputHandleId = (handleId?: string | null) =>
  handleId === PSQL_TABLE_INPUT_HANDLE_ID ||
  handleId === PSQL_TABLE_INPUT_LEGACY_HANDLE_ID;

const appViewInputEndpoint = (nodeId: string): ConnectionEndpoint => ({
  id: endpointId(nodeId, "input", APP_VIEW_INPUT_HANDLE_ID),
  nodeId,
  handleId: APP_VIEW_INPUT_HANDLE_ID,
  ownerKind: "appView",
  direction: "input",
  label: "Navigate here",
});

export const getAppViewInputEndpoint = appViewInputEndpoint;

export const getAppViewOnLoadEndpoint = (nodeId: string): ConnectionEndpoint => ({
  id: endpointId(nodeId, "output", APP_VIEW_ON_LOAD_SOURCE_HANDLE_ID),
  nodeId,
  handleId: APP_VIEW_ON_LOAD_SOURCE_HANDLE_ID,
  ownerKind: "appViewLifecycle",
  direction: "output",
  label: "onLoad",
});

export const getAppViewEventEndpoint = (
  nodeId: string,
  event: { id: string; name: string },
): ConnectionEndpoint => {
  const handleId = appViewEventSourceHandleId(event.id);
  return {
    id: endpointId(nodeId, "output", handleId),
    nodeId,
    ownerId: event.id,
    handleId,
    ownerKind: "appViewEvent",
    direction: "output",
    label: event.name || "event",
  };
};

export const getRestMethodInputEndpoint = (
  nodeId: string,
  method: RestResourceMethod,
): ConnectionEndpoint => {
  const handleId = restMethodTargetHandleId(method.id);
  return {
    id: endpointId(nodeId, "input", handleId),
    nodeId,
    ownerId: method.id,
    handleId,
    ownerKind: "restMethod",
    direction: "input",
    label: method.kind,
  };
};

export const getRestMethodOutputEndpoint = (
  nodeId: string,
  method: RestResourceMethod,
): ConnectionEndpoint => {
  const handleId = restMethodSourceHandleId(method.id);
  return {
    id: endpointId(nodeId, "output", handleId),
    nodeId,
    ownerId: method.id,
    handleId,
    ownerKind: "restMethod",
    direction: "output",
    label: method.kind,
  };
};

export const getPsqlTableInputEndpoint = (
  nodeId: string,
): ConnectionEndpoint => ({
  id: endpointId(nodeId, "input", PSQL_TABLE_INPUT_HANDLE_ID),
  nodeId,
  handleId: PSQL_TABLE_INPUT_HANDLE_ID,
  ownerKind: "psqlTable",
  direction: "input",
  label: "Store data",
});

export const getWildcardInputEndpoint = (
  nodeId: string,
): ConnectionEndpoint => ({
  id: endpointId(nodeId, "input", WILDCARD_INPUT_HANDLE_ID),
  nodeId,
  handleId: WILDCARD_INPUT_HANDLE_ID,
  ownerKind: "wildcard",
  direction: "input",
  label: "Connect",
});

export const getWildcardOutputEndpoint = (
  nodeId: string,
): ConnectionEndpoint => ({
  id: endpointId(nodeId, "output", WILDCARD_OUTPUT_HANDLE_ID),
  nodeId,
  handleId: WILDCARD_OUTPUT_HANDLE_ID,
  ownerKind: "wildcard",
  direction: "output",
  label: "Connect",
});

export const getNodeConnectionEndpoints = (
  node: ConnectableNode,
): ConnectionEndpoint[] => {
  if (node.data.kind === "appView") {
    return [
      appViewInputEndpoint(node.id),
      getAppViewOnLoadEndpoint(node.id),
      ...node.data.events.map((event) =>
        getAppViewEventEndpoint(node.id, event),
      ),
    ];
  }

  if (node.data.kind === "restResource") {
    return node.data.methods.flatMap((method) => [
      getRestMethodInputEndpoint(node.id, method),
      getRestMethodOutputEndpoint(node.id, method),
    ]);
  }

  if (node.data.kind === "psqlTable") {
    return [getPsqlTableInputEndpoint(node.id)];
  }

  if (node.data.kind === "wildcard") {
    return [
      getWildcardInputEndpoint(node.id),
      getWildcardOutputEndpoint(node.id),
    ];
  }

  return [];
};

export const getAllConnectionEndpoints = (
  nodes: readonly ConnectableNode[],
): ConnectionEndpoint[] => nodes.flatMap(getNodeConnectionEndpoints);

export const getConnectionEndpointByHandle = (
  nodes: readonly ConnectableNode[],
  nodeId?: string | null,
  handleId?: string | null,
  direction?: ConnectionEndpointDirection,
): ConnectionEndpoint | null => {
  if (!nodeId || !handleId) {
    return null;
  }

  const node = nodes.find((item) => item.id === nodeId);
  if (!node || node.data.kind === "annotation") {
    return null;
  }

  if (
    direction === "input" &&
    node.data.kind === "appView" &&
    isAppViewInputHandleId(handleId)
  ) {
    return appViewInputEndpoint(node.id);
  }

  if (
    direction === "input" &&
    node.data.kind === "psqlTable" &&
    isPsqlTableInputHandleId(handleId)
  ) {
    return getPsqlTableInputEndpoint(node.id);
  }

  return (
    getNodeConnectionEndpoints(node).find(
      (endpoint) =>
        endpoint.handleId === handleId &&
        (!direction || endpoint.direction === direction),
    ) ?? null
  );
};

const restMethodKindForEndpoint = (
  endpoint: ConnectionEndpoint,
  nodes: readonly ConnectableNode[],
): RestMethodKind | null => {
  if (endpoint.ownerKind !== "restMethod" || !endpoint.ownerId) {
    return null;
  }

  const node = nodes.find((item) => item.id === endpoint.nodeId);
  if (node?.data.kind !== "restResource") {
    return null;
  }

  return node.data.methods.find((method) => method.id === endpoint.ownerId)
    ?.kind ?? null;
};

const isReadMethod = (kind: RestMethodKind) =>
  kind === "GET /" || kind === "GET /{id}";

export const connectionKindForRestMethod = (
  kind: RestMethodKind,
): ConnectionKind => (isReadMethod(kind) ? "read" : "write");

export const getCompatibleEndpointConnection = (
  sourceEndpoint: ConnectionEndpoint | null | undefined,
  targetEndpoint: ConnectionEndpoint | null | undefined,
  nodes: readonly ConnectableNode[],
): ConnectionKind | null => {
  if (
    !sourceEndpoint ||
    !targetEndpoint ||
    sourceEndpoint.direction !== "output" ||
    targetEndpoint.direction !== "input" ||
    sourceEndpoint.nodeId === targetEndpoint.nodeId
  ) {
    return null;
  }

  if (
    (sourceEndpoint.ownerKind === "appViewLifecycle" ||
      sourceEndpoint.ownerKind === "appViewEvent") &&
    targetEndpoint.ownerKind === "restMethod"
  ) {
    const methodKind = restMethodKindForEndpoint(targetEndpoint, nodes);
    return methodKind ? connectionKindForRestMethod(methodKind) : null;
  }

  if (
    sourceEndpoint.ownerKind === "appViewEvent" &&
    targetEndpoint.ownerKind === "appView"
  ) {
    return "navigate";
  }

  if (
    sourceEndpoint.ownerKind === "restMethod" &&
    targetEndpoint.ownerKind === "psqlTable"
  ) {
    const methodKind = restMethodKindForEndpoint(sourceEndpoint, nodes);
    return methodKind ? connectionKindForRestMethod(methodKind) : null;
  }

  if (
    sourceEndpoint.ownerKind === "wildcard" ||
    targetEndpoint.ownerKind === "wildcard"
  ) {
    return "read/write";
  }

  return null;
};

export const remapConnectionEndpointHandle = (
  handleId: string | null | undefined,
  remapValue: (value: string) => string,
) => {
  const appViewEventId = parseAppViewEventSourceHandleId(handleId);
  if (appViewEventId) {
    return appViewEventSourceHandleId(remapValue(appViewEventId));
  }

  const restMethodTargetId = parseRestMethodTargetHandleId(handleId);
  if (restMethodTargetId) {
    return restMethodTargetHandleId(remapValue(restMethodTargetId));
  }

  const restMethodSourceId = parseRestMethodSourceHandleId(handleId);
  if (restMethodSourceId) {
    return restMethodSourceHandleId(remapValue(restMethodSourceId));
  }

  return handleId;
};
