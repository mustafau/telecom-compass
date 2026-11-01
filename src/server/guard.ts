/**
 * Import this module from every server entry that must never reach the browser bundle.
 * Accidental client inclusion throws at module evaluation time.
 */
const isBrowser = typeof globalThis === "object" && "window" in globalThis;
if (isBrowser) {
  throw new Error("Server-only module imported in a browser context");
}
