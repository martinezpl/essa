export const createId = (prefix: string) =>
  `${prefix}-${globalThis.crypto.randomUUID()}`;
