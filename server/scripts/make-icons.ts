// One-off: renders public/icon.svg to icon-512.png, icon-192.png and favicon.ico (an ICO holding a 64x64 PNG).
// Uses the system Chrome headless (SITE_CLI_CHROME, else the macOS default), no dependency.
//   bun server/scripts/make-icons.ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const pub = join(import.meta.dir, "..", "public");
const chrome = process.env.SITE_CLI_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const svg = readFileSync(join(pub, "icon.svg"), "utf8");
const tmp = mkdtempSync(join(tmpdir(), "make-icons-"));

function render(size: number): Uint8Array {
  const html = join(tmp, `i${size}.html`);
  const png = join(tmp, `i${size}.png`);
  writeFileSync(html, `<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg.replace(/<svg /, "<svg ").replace(/ width="\d+" height="\d+"/, "")}`);
  const p = Bun.spawnSync([
    chrome, "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars", "--default-background-color=00000000",
    `--user-data-dir=${join(tmp, "profile")}`, `--window-size=${size},${size}`, `--screenshot=${png}`, `file://${html}`,
  ]);
  if (p.exitCode !== 0) throw new Error(`Chrome failed (${p.exitCode}): ${p.stderr.toString().slice(0, 300)}`);
  return new Uint8Array(readFileSync(png));
}

/** An ICO container with one PNG image (size at most 255 here). */
export function ico(png: Uint8Array, size: number): Uint8Array {
  const out = new Uint8Array(22 + png.length);
  const v = new DataView(out.buffer);
  v.setUint16(2, 1, true); // type: icon
  v.setUint16(4, 1, true); // one image
  out[6] = size; out[7] = size; // width, height
  v.setUint16(10, 1, true); // planes
  v.setUint16(12, 32, true); // bits per pixel
  v.setUint32(14, png.length, true);
  v.setUint32(18, 22, true); // offset of the image data
  out.set(png, 22);
  return out;
}

if (import.meta.main) {
  try {
    writeFileSync(join(pub, "icon-512.png"), render(512));
    writeFileSync(join(pub, "icon-192.png"), render(192));
    writeFileSync(join(pub, "favicon.ico"), ico(render(64), 64));
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
