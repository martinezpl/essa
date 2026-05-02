import { Handle, Position } from "@xyflow/react";
import { blockDefinitions } from "../../domain/model";
import type { BlockKind } from "../../domain/types";

type BlockHandlesProps = {
  kind: BlockKind;
};

export const BlockHandles = ({ kind }: BlockHandlesProps) => (
  <>
    {blockDefinitions[kind].ports.map((port) => (
      <Handle
        id={port.id}
        key={port.id}
        position={port.direction === "input" ? Position.Left : Position.Right}
        type={port.direction === "input" ? "target" : "source"}
      />
    ))}
  </>
);
