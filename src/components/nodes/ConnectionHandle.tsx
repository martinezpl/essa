import { Handle, Position } from "@xyflow/react";
import type { ConnectionEndpoint } from "../../domain/connectionEndpoints";

export type ConnectionUiState = {
  activeEndpointId?: string | null;
  dragging?: boolean;
  validTargetEndpointIds?: string[];
};

type ConnectionHandleProps = {
  endpoint: ConnectionEndpoint;
  state?: ConnectionUiState;
};

export type ConnectionUiData = {
  __connectionUx?: ConnectionUiState;
};

export const getConnectionUiState = (data: unknown): ConnectionUiState => {
  if (!data || typeof data !== "object") {
    return {};
  }

  return ((data as ConnectionUiData).__connectionUx ?? {}) as ConnectionUiState;
};

export const getConnectionInteractionClass = (
  endpoint: ConnectionEndpoint,
  state?: ConnectionUiState,
) => {
  const isActive = state?.activeEndpointId === endpoint.id;
  const isValidTarget = Boolean(
    state?.validTargetEndpointIds?.includes(endpoint.id),
  );

  return [
    isActive ? "connection-target--active" : "",
    isValidTarget ? "connection-target--valid" : "",
    state?.dragging && !isActive && !isValidTarget
      ? "connection-target--inactive"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
};

export const ConnectionHandle = ({
  endpoint,
  state,
}: ConnectionHandleProps) => {
  const isActive = state?.activeEndpointId === endpoint.id;
  const isValidTarget = Boolean(
    state?.validTargetEndpointIds?.includes(endpoint.id),
  );

  return (
    <Handle
      className={[
        "connection-handle",
        `connection-handle--${endpoint.direction}`,
        isActive ? "connection-handle--active" : "",
        isValidTarget ? "connection-handle--valid-target" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      id={endpoint.handleId}
      position={endpoint.direction === "input" ? Position.Left : Position.Right}
      title={endpoint.label}
      type={endpoint.direction === "input" ? "target" : "source"}
    />
  );
};
