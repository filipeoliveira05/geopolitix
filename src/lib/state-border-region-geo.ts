import { getUsStatesGeoJson } from "./us-states-geo";
import { getStateNeighborAbbrs } from "./state-borders";
import {
  getProjectedRings,
  fitPointsToViewBox,
  transformPoint,
  ringsToPathD,
  type ProjectedPoint,
} from "./state-silhouette-geo";

export type RegionalStateShape = {
  abbr: string;
  name: string;
  path: string;
  // The area-weighted centroid (center of mass) of the shape's single largest ring, in the same
  // VIEWBOX_SIZE SVG coordinate space as `path` — NOT a bounding-box midpoint, which lands right
  // on or outside the shape's own border for an elongated or bendy state (Tennessee's long
  // east-west strip, Virginia's notched southeast corner). Only the largest ring counts, so a
  // small offshore island/inlet ring doesn't pull the label away from the main landmass.
  labelX: number;
  labelY: number;
};

function centerOf(points: ProjectedPoint[]): ProjectedPoint {
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
  return [(minX + maxX) / 2, (minY + maxY) / 2];
}

// Signed area via the shoelace formula — positive/negative depending on the ring's winding
// direction, which the caller doesn't care about (only used via Math.abs, or as the centroid
// formula's own denominator, which needs the true signed value to come out right).
function ringArea(ring: ProjectedPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

// Standard area-weighted polygon centroid (the "center of mass" of the filled shape, not just an
// average of its vertices) — falls back to the bounding-box midpoint for a degenerate
// (near-zero-area) ring, which would otherwise divide by ~0.
function ringCentroid(ring: ProjectedPoint[]): ProjectedPoint {
  const area = ringArea(ring);
  if (Math.abs(area) < 1e-9) return centerOf(ring);
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[(i + 1) % ring.length];
    const cross = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  const factor = 1 / (6 * area);
  return [cx * factor, cy * factor];
}

/** The centroid of a shape's single largest ring (by area) — see RegionalStateShape.labelX. */
function largestRingCentroid(rings: ProjectedPoint[][]): ProjectedPoint {
  let best = rings[0];
  let bestArea = -1;
  for (const ring of rings) {
    const area = Math.abs(ringArea(ring));
    if (area > bestArea) {
      bestArea = area;
      best = ring;
    }
  }
  return ringCentroid(best);
}

/**
 * Fits a subject state and every one of its real neighbors into ONE shared coordinate space (not
 * each shape fit to its own individual box, the way getStateSilhouettePath works) — so every
 * shape lands in its correct position relative to the others, composing into one coherent regional
 * picture instead of same-size unrelated silhouettes. Powers the border-recall question's
 * post-answer reveal map. Returns null for a subject with zero real neighbors (Alaska/Hawaii) or
 * an unrecognized abbreviation — buildStateBorderRecallQuestions already excludes 0-neighbor
 * subjects, so this is only ever a defensive guard, not a real path in practice.
 */
export function getBorderRegionMap(
  subjectAbbr: string,
): { subject: RegionalStateShape; neighbors: RegionalStateShape[] } | null {
  const byAbbr = new Map(
    getUsStatesGeoJson().features.map((f) => [f.properties.abbr, f] as const),
  );
  const subjectFeature = byAbbr.get(subjectAbbr);
  const neighborAbbrs = getStateNeighborAbbrs(subjectAbbr);
  if (!subjectFeature || neighborAbbrs.length === 0) return null;

  const entries = [subjectAbbr, ...neighborAbbrs].map((abbr) => {
    const feature = byAbbr.get(abbr);
    if (!feature) return null;
    return { abbr, feature, rings: getProjectedRings(feature.geometry, abbr === "AK") };
  });
  if (entries.some((e) => e === null)) return null;
  const validEntries = entries as { abbr: string; feature: NonNullable<typeof subjectFeature>; rings: ProjectedPoint[][] }[];

  const fit = fitPointsToViewBox(validEntries.flatMap((e) => e.rings.flat()));

  function shapeFor(entry: (typeof validEntries)[number]): RegionalStateShape {
    const fitRings = entry.rings.map((ring) => ring.map((p) => transformPoint(p, fit)));
    const [labelX, labelY] = largestRingCentroid(fitRings);
    return {
      abbr: entry.abbr,
      name: entry.feature.properties.name,
      path: ringsToPathD(fitRings),
      labelX,
      labelY,
    };
  }

  const [subjectEntry, ...neighborEntries] = validEntries;
  return {
    subject: shapeFor(subjectEntry),
    neighbors: neighborEntries.map(shapeFor),
  };
}

/**
 * Every real neighbor of `subjectAbbr`, ordered starting from the northernmost and going
 * clockwise — used to order the border-recall question's target list by a meaningful geographic
 * relationship instead of alphabetically (which leaks letter-range hints about the remaining
 * unfound targets as slots get filled in). Uses each state's raw projected bounding-box center
 * (not fit to any shared box — a bearing between two points is invariant under the later uniform
 * scale/translate anyway, so the extra fit step would be wasted work here).
 */
export function getNeighborsClockwiseFromNorth(subjectAbbr: string): string[] {
  const byAbbr = new Map(
    getUsStatesGeoJson().features.map((f) => [f.properties.abbr, f] as const),
  );
  const subjectFeature = byAbbr.get(subjectAbbr);
  const neighborAbbrs = getStateNeighborAbbrs(subjectAbbr);
  if (!subjectFeature) return neighborAbbrs;

  const subjectCenter = centerOf(getProjectedRings(subjectFeature.geometry, false).flat());

  return [...neighborAbbrs].sort((a, b) => {
    const bearingOf = (abbr: string) => {
      const feature = byAbbr.get(abbr);
      if (!feature) return 0;
      const [x, y] = centerOf(getProjectedRings(feature.geometry, abbr === "AK").flat());
      const dx = x - subjectCenter[0];
      const dy = y - subjectCenter[1];
      // atan2(dx, dy) (not the usual atan2(dy, dx)) gives a compass bearing directly: 0 = due
      // north (dy > 0, since projected y grows northward), 90 = due east, going clockwise —
      // exactly the "start from north, go clockwise" order this is meant to produce.
      const bearing = (Math.atan2(dx, dy) * 180) / Math.PI;
      return bearing < 0 ? bearing + 360 : bearing;
    };
    return bearingOf(a) - bearingOf(b);
  });
}
