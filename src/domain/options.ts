import type {
  BlockKind,
  JsonFieldType,
  PostgresType,
  RestMethodKind,
} from "./types";
import {
  blockList,
  jsonFieldTypes as jsonFieldTypeOptions,
  postgresTypes as postgresTypeOptions,
  restMethodKinds,
} from "./model";

export const blockKinds: Array<{ kind: BlockKind; label: string }> = blockList.map(
  ({ kind, label }) => ({ kind, label }),
);

export const restMethods: RestMethodKind[] = Array.from(restMethodKinds);

export const postgresTypes: PostgresType[] = Array.from(postgresTypeOptions);

export const jsonFieldTypes: JsonFieldType[] = Array.from(jsonFieldTypeOptions);
