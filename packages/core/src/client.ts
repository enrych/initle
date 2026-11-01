// Browser entry: everything the web app needs, without zod schemas or the pack catalogue.
export * from "./config";
export * from "./types";
export * from "./text";
export { buildBoard, revealedPositions } from "./view";
export type { ClientMessage, ServerMessage, PackSummary } from "./protocol";
