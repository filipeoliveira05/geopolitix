import type { Geometry, Position } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";

// A 0..100 square viewBox with a little breathing room around the shape (90x90 usable), same
// "uniform scale, never distort aspect ratio" approach as us-insets.ts's AK/HI repositioning.
const VIEWBOX_SIZE = 100;
const PADDING_FRACTION = 0.9;

/**
 * Projects lon/lat to a Web Mercator-like (x, y) pair — same conformal projection MapLibre itself
 * renders the interactive map with — so a state's silhouette here looks like the same shape a
 * player already recognizes from that map, rather than a naive equirectangular (linear-latitude)
 * fit, which visibly stretches/squashes states at higher latitudes (Minnesota, Maine) more than
 * ones nearer the equator. Only relative x/y proportions matter here (everything gets uniformly
 * scaled to fit a box afterward), so the projection's absolute units are irrelevant.
 */
function project([lon, lat]: Position): [number, number] {
  const x = (lon * Math.PI) / 180;
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [x, y];
}

function walkRings(geom: Geometry, fn: (ring: Position[]) => void) {
  if (geom.type === "Polygon") {
    geom.coordinates.forEach(fn);
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach((poly) => poly.forEach(fn));
  }
}

/**
 * Builds one state's silhouette as an SVG path `d` string, fit/centered into a square
 * VIEWBOX_SIZE x VIEWBOX_SIZE box with the shape's own aspect ratio preserved (never stretched to
 * fill a non-square bounding box). Multiple rings (islands, lake-holes) become separate `M...Z`
 * subpaths joined with spaces — rendered with fill-rule="evenodd" by the caller, so the winding
 * direction of any individual ring doesn't matter.
 */
function buildSilhouettePath(geom: Geometry, normalizeAntimeridian: boolean): string {
  // Alaska's westernmost Aleutian islands cross the antimeridian and are recorded as positive
  // longitudes (~172E) rather than continuing past -180 — left as-is, they'd blow the bounding
  // box out to nearly the whole globe (same gotcha us-insets.ts already solves for the
  // interactive map's Alaska inset). Wrapping them to lon-360 first makes the whole state's
  // coordinates span one contiguous range before projecting/measuring it.
  const rings: [number, number][][] = [];
  walkRings(geom, (ring) => {
    rings.push(
      ring.map(([lon, lat]) => project([normalizeAntimeridian && lon > 0 ? lon - 360 : lon, lat])),
    );
  });

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  const dataWidth = maxX - minX;
  const dataHeight = maxY - minY;
  const scale =
    (Math.min(VIEWBOX_SIZE / dataWidth, VIEWBOX_SIZE / dataHeight) * PADDING_FRACTION) || 0;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const half = VIEWBOX_SIZE / 2;

  return rings
    .map((ring) => {
      const points = ring.map(([x, y]) => {
        // Mercator y grows northward, SVG y grows downward — flip the sign so north still ends
        // up near the top of the box.
        const svgX = half + (x - centerX) * scale;
        const svgY = half - (y - centerY) * scale;
        return `${svgX.toFixed(2)},${svgY.toFixed(2)}`;
      });
      return `M${points.join("L")}Z`;
    })
    .join(" ");
}

let cachedPaths: Map<string, string> | null = null;

function getAllSilhouettePaths(): Map<string, string> {
  if (!cachedPaths) {
    cachedPaths = new Map();
    for (const f of getUsStatesGeoJson().features) {
      const abbr = f.properties.abbr;
      if (!abbr) continue;
      cachedPaths.set(abbr, buildSilhouettePath(f.geometry, abbr === "AK"));
    }
  }
  return cachedPaths;
}

/** An SVG path `d` string for the given state abbreviation, or null if unrecognized. */
export function getStateSilhouettePath(abbr: string): string | null {
  return getAllSilhouettePaths().get(abbr) ?? null;
}
