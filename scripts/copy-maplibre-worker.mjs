// MapLibre GL derives its worker script URL from `import.meta.url` of its own
// bundled module, which points at an internal Next.js/Turbopack chunk with no
// sibling worker file — so the worker silently fails to load and map layers
// never render (no page-level error). Work around it by copying the worker
// script into `public/` at install time and pointing MapLibre at it via
// `setWorkerUrl` in src/components/UsMap.tsx.
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(root, "..", "node_modules", "maplibre-gl", "dist");
const destDir = path.join(root, "..", "public");

mkdirSync(destDir, { recursive: true });

// The worker module imports "./maplibre-gl-shared.mjs" as a relative
// sibling, so both files need to be served from the same public directory.
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  const src = path.join(distDir, file);
  const dest = path.join(destDir, file);
  copyFileSync(src, dest);
  console.log(`Copied ${src} -> ${dest}`);
}
