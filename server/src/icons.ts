// The logo files in server/public/, read once at startup (relative to this module, so it works from the image too).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "..", "public");
type Icon = { body: Uint8Array<ArrayBuffer>; type: string };
const load = (file: string, type: string): Icon => ({ body: new Uint8Array(readFileSync(join(dir, file))), type });

/** Public routes to their bytes and content type. */
export const ICON_ROUTES: Record<string, Icon> = {
  "/icon.svg": load("icon.svg", "image/svg+xml"),
  "/icon.png": load("icon-512.png", "image/png"),
  "/icon-192.png": load("icon-192.png", "image/png"),
  "/favicon.ico": load("favicon.ico", "image/x-icon"),
};

/** The serverInfo icons for a public address, or none without one. */
export function serverIcons(publicUrl?: string) {
  const base = publicUrl?.replace(/\/+$/, "");
  if (!base) return undefined;
  return [
    { src: `${base}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
    { src: `${base}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
  ];
}
