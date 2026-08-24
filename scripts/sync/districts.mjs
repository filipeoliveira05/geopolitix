// Populates src/data/districts.json with current US House district
// boundaries — a stand-in for the Supabase `districts` table (plan §4) until
// Supabase sync jobs exist; run manually via `npm run sync:districts`.
//
// Source: US Census Bureau cartographic boundary file for the 119th Congress
// (currently in effect — matches the "current" terms from the legislators
// sync). Official, free, no API key.
//
// Note: the plan originally pointed at `unitedstates/districts` (GitHub) for
// this, but that repo's last *full nationwide* set is from 2016 — pre-2020-
// census redistricting. Its newer folders (2018/2020/2022) are partial,
// single-state off-cycle updates (PA/NC/NJ only), not current nationwide
// boundaries. Using it would draw wrong shapes (e.g. Texas only had 36
// districts pre-2020-census; it has 38 now, matching our synced legislator
// data). The Census cartographic boundary file is current and equally free,
// so we use that instead.
//
// Output format: TopoJSON, not raw GeoJSON — same approach as the `us-atlas`
// package already used for state boundaries (src/lib/us-states-geo.ts).
// Raw GeoJSON for all 436 districts was ~13MB even after rounding coordinate
// precision, because that doesn't touch vertex *count*, which is what
// actually drives size. Building a topology (shared borders between adjacent
// districts stored once) and simplifying it cuts that dramatically — the
// same reason us-atlas's 50-state file is only ~112KB.
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import JSZip from "jszip";
import { read as readShapefile } from "shapefile";
import { topology } from "topojson-server";
import { presimplify, quantile, simplify } from "topojson-simplify";
import { quantize } from "topojson-client";

const SOURCE_URL =
  "https://www2.census.gov/geo/tiger/GENZ2024/shp/cb_2024_us_cd119_500k.zip";
const SHP_BASENAME = "cb_2024_us_cd119_500k";

// Keep this fraction of vertices (by simplification weight) — tuned by trial
// against output size vs. visible shape fidelity at the zoom levels the map
// actually uses (state/national, not street-level).
const RETAIN_FRACTION = 0.1;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "src", "data");
const outFile = path.join(outDir, "districts.json");

const fipsToAbbr = JSON.parse(
  readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8"),
);

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch districts data: ${res.status} ${res.statusText}`);
  }
  const zip = await JSZip.loadAsync(await res.arrayBuffer());
  const shpBuf = await zip.file(`${SHP_BASENAME}.shp`).async("arraybuffer");
  const dbfBuf = await zip.file(`${SHP_BASENAME}.dbf`).async("arraybuffer");

  const collection = await readShapefile(shpBuf, dbfBuf);

  const features = [];
  let skippedTerritories = 0;

  for (const feature of collection.features) {
    const stateFips = feature.properties.STATEFP;
    const abbr = fipsToAbbr[stateFips];
    if (!abbr) {
      skippedTerritories++; // Puerto Rico, Guam, etc. — not on our map (see states.ts)
      continue;
    }
    const districtRaw = feature.properties.CD119FP;
    // "ZZ" = no district assigned (shouldn't occur here); "00" = at-large.
    // "98" = Census's code for DC's (and the territories') non-voting
    // delegate district — congress-legislators encodes the same seat as
    // district 0 (its "at-large" convention), so remap to join correctly.
    const district =
      districtRaw === "ZZ" ? null : districtRaw === "98" ? 0 : Number(districtRaw);

    features.push({
      type: "Feature",
      properties: { stateId: abbr, district, geoid: feature.properties.GEOID },
      geometry: feature.geometry,
    });
  }

  // Simplify first, quantize last: presimplify() dequantizes internally (it
  // needs true coordinates to compute simplification weights), so
  // quantizing up front gets silently discarded by the time simplify() runs.
  // Quantization snaps coordinates to a grid before delta-encoding arcs —
  // this is what actually makes the final topology compact (small integers
  // instead of long decimals); 1e5 (~100k steps across the US) is the usual
  // topojson default and still far finer than this map's zoom levels need.
  const rawTopology = topology({
    districts: { type: "FeatureCollection", features },
  });
  const presimplified = presimplify(rawTopology);
  const minWeight = quantile(presimplified, 1 - RETAIN_FRACTION);
  const simplified = quantize(simplify(presimplified, minWeight), 1e5);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outFile,
    JSON.stringify({
      source: SOURCE_URL,
      generatedAt: new Date().toISOString(),
      topology: simplified,
    }) + "\n",
  );

  console.log(
    `Wrote ${features.length} districts (skipped ${skippedTerritories} territory features) -> ${path.relative(root, outFile)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
