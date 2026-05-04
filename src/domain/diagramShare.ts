import { deflateRaw, inflateRaw } from "pako";
import { z } from "zod";
import { diagramSchema, type Diagram } from "./types";

const ESSA_DIAGRAM_SHARE_KIND = "essa.diagram.share";
const ESSA_DIAGRAM_SHARE_VERSION = 1;

export const DIAGRAM_SHARE_HASH_PARAM = "share";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const diagramSharePayloadSchema = z.object({
  kind: z.literal(ESSA_DIAGRAM_SHARE_KIND),
  version: z.literal(ESSA_DIAGRAM_SHARE_VERSION),
  diagram: diagramSchema,
});

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

export const encodeDiagramSharePayload = (diagram: Diagram) => {
  const rawValue = JSON.stringify({
    kind: ESSA_DIAGRAM_SHARE_KIND,
    version: ESSA_DIAGRAM_SHARE_VERSION,
    diagram,
  });

  return bytesToBase64Url(deflateRaw(textEncoder.encode(rawValue)));
};

export const decodeDiagramSharePayload = (value: string): Diagram => {
  const inflated = inflateRaw(base64UrlToBytes(value));
  const rawValue = textDecoder.decode(inflated);

  return diagramSharePayloadSchema.parse(JSON.parse(rawValue)).diagram;
};

export const createDiagramShareHash = (diagram: Diagram) =>
  `${DIAGRAM_SHARE_HASH_PARAM}=${encodeDiagramSharePayload(diagram)}`;

export const parseDiagramShareHash = (hash: string): Diagram | null => {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  const payload = params.get(DIAGRAM_SHARE_HASH_PARAM);

  return payload ? decodeDiagramSharePayload(payload) : null;
};
