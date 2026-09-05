import type { Geometry, Position } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";

// A 0..100 square viewBox with a little breathing room around the shape (90x90 usable), same
// "uniform scale, never distort aspect ratio" approach as us-insets.ts's AK/HI repositioning.
export const VIEWBOX_SIZE = 100;
const PADDING_FRACTION = 0.9;

export type ProjectedPoint = [number, number];
export type Fit = { scale: number; centerX: number; centerY: number };

/**
 * Projects lon/lat to a Web Mercator-like (x, y) pair — same conformal projection MapLibre itself
 * renders the interactive map with — so a state's silhouette here looks like the same shape a
 * player already recognizes from that map, rather than a naive equirectangular (linear-latitude)
 * fit, which visibly stretches/squashes states at higher latitudes (Minnesota, Maine) more than
 * ones nearer the equator. Only relative x/y proportions matter here (everything gets uniformly
 * scaled to fit a box afterward), so the projection's absolute units are irrelevant.
 *
 * Alaska's westernmost Aleutian islands cross the antimeridian and are recorded as positive
 * longitudes (~172E) rather than continuing past -180 — left as-is, they'd blow the bounding box
 * out to nearly the whole globe (same gotcha us-insets.ts already solves for the interactive
 * map's Alaska inset). `normalizeAntimeridian` (pass true only for Alaska) wraps them to lon-360
 * first, so the whole state's coordinates span one contiguous range before projecting/measuring.
 */
export function projectLonLat([lon, lat]: Position, normalizeAntimeridian: boolean): ProjectedPoint {
  const l = normalizeAntimeridian && lon > 0 ? lon - 360 : lon;
  const x = (l * Math.PI) / 180;
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

/** Every ring of `geom`, already projected (see projectLonLat) — one array of points per ring. */
export function getProjectedRings(
  geom: Geometry,
  normalizeAntimeridian: boolean,
): ProjectedPoint[][] {
  const rings: ProjectedPoint[][] = [];
  walkRings(geom, (ring) => {
    rings.push(ring.map((c) => projectLonLat(c, normalizeAntimeridian)));
  });
  return rings;
}

/**
 * Computes the uniform scale + center needed to fit a whole set of already-projected points into
 * a VIEWBOX_SIZE x VIEWBOX_SIZE square (aspect ratio preserved, never stretched) — generalizes
 * over an arbitrary point set so callers can fit one shape alone, or several shapes together into
 * one shared coordinate space (e.g. a subject state plus all its neighbors, so they land in their
 * correct positions relative to each other).
 */
export function fitPointsToViewBox(points: ProjectedPoint[]): Fit {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const dataWidth = maxX - minX;
  const dataHeight = maxY - minY;
  const scale =
    (Math.min(VIEWBOX_SIZE / dataWidth, VIEWBOX_SIZE / dataHeight) * PADDING_FRACTION) || 0;
  return { scale, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

/** Maps one projected point into VIEWBOX_SIZE-square SVG coordinates via a precomputed `fit`. */
export function transformPoint([x, y]: ProjectedPoint, fit: Fit): ProjectedPoint {
  const half = VIEWBOX_SIZE / 2;
  // Mercator y grows northward, SVG y grows downward — flip the sign so north still ends up near
  // the top of the box.
  return [half + (x - fit.centerX) * fit.scale, half - (y - fit.centerY) * fit.scale];
}

/**
 * Joins already-SVG-space rings into one path `d` string. Multiple rings (islands, lake-holes)
 * become separate `M...Z` subpaths joined with spaces — rendered with fill-rule="evenodd" by the
 * caller, so the winding direction of any individual ring doesn't matter.
 */
export function ringsToPathD(rings: ProjectedPoint[][]): string {
  return rings
    .map((ring) => {
      const points = ring.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`);
      return `M${points.join("L")}Z`;
    })
    .join(" ");
}

function buildSilhouettePath(geom: Geometry, normalizeAntimeridian: boolean): string {
  const rings = getProjectedRings(geom, normalizeAntimeridian);
  const fit = fitPointsToViewBox(rings.flat());
  return ringsToPathD(rings.map((ring) => ring.map((p) => transformPoint(p, fit))));
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
