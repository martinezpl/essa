import type {
  BlockKind,
  JsonFieldType,
  PsqlColumnType,
  PsqlIndexMethod,
  RestMethodKind,
} from "./types";
import {
  blockList,
  jsonFieldTypes as jsonFieldTypeOptions,
  psqlColumnTypes as psqlColumnTypeOptions,
  psqlIndexMethods as psqlIndexMethodOptions,
  restMethodInputModes as restMethodInputModeOptions,
  restMethodKinds,
} from "./model";

export const blockKinds: Array<{ kind: BlockKind; label: string }> = blockList.map(
  ({ kind, label }) => ({ kind, label }),
);

export const restMethods: RestMethodKind[] = Array.from(restMethodKinds);

export const psqlColumnTypes: PsqlColumnType[] = Array.from(psqlColumnTypeOptions);

export const psqlIndexMethods: PsqlIndexMethod[] = Array.from(
  psqlIndexMethodOptions,
);

export const jsonFieldTypes: JsonFieldType[] = Array.from(jsonFieldTypeOptions);

export const restMethodInputModes: Array<"payload" | "query"> = Array.from(
  restMethodInputModeOptions,
);
