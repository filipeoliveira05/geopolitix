import area from "@turf/area";
import polylabel from "polylabel";
import type { Feature, FeatureCollection, Geometry, Point, Position } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";
import { remapInsetStates } from "./us-insets";

export type StateLabelProperties = { abbr: string; name: string };

let cached: FeatureCollection<Point, StateLabelProperties> | null = null;

// Web Mercator (the projection MapLibre actually renders in, same as every other web map)
// stretches the latitude axis non-uniformly, more so at higher latitudes — so a point
// computed as "maximally centered" in raw lon/lat is not generally the same point that's
// maximally centered once projected onto the screen. Running polylabel in lon/lat space
// visibly mis-centers labels for states with real latitude range (MT/ND/SD/OR, CA's 32-42N
// span) and for small/irregular states where even a small mismatch reads as clearly off
// (NJ, CT, MA). Projecting to Mercator x/y first, running polylabel there, then unprojecting
// the result back to lon/lat fixes this — the unprojected output is still a valid LngLat for
// Marker.setLngLat, MapLibre reprojects it the same way on render.
function lonLatToMercator([lon, lat]: Position): Position {
  const latRad = (lat * Math.PI) / 180;
  return [lon, (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + latRad / 2))];
}

function mercatorToLonLat([x, y]: Position): Position {
  const latRad = 2 * Math.atan(Math.exp((y * Math.PI) / 180)) - Math.PI / 2;
  return [x, (latRad * 180) / Math.PI];
}

/**
 * Manual nudges for states whose algorithmic (pole-of-inaccessibility-in-Mercator-space)
 * position still doesn't read as centered after eyeballing every state on the rendered map —
 * polylabel optimizes for "farthest from any edge", not for what looks visually balanced to a
 * person, and the two diverge for states with a panhandle, a bite taken out of one side, etc.
 * `dx`/`dy` are screen-relative fractions of that state's own bounding-box width/height (so a
 * given value stays proportional to the state's size rather than a fixed degree offset):
 * dx negative = left, positive = right; dy negative = down/south, positive = up/north.
 * Hand-tuned by eye — edit the numbers directly to adjust.
 */
const LABEL_NUDGES: Record<string, { dx?: number; dy?: number }> = {
  OR: { dx: -0.1 },
  AZ: { dy: -0.12 },
  MT: { dx: 0.2 },
  CO: { dx: 0.15 },
  TX: { dx: -0.05, dy: 0.05 },
  OK: { dx: -0.1 },
  SD: { dx: 0.2 },
  MN: { dy: -0.15 },
  IA: { dx: 0.1 },
  MO: { dy: 0.05 },
  LA: { dy: -0.2 },
  MS: { dy: -0.12 },
  WI: { dy: -0.05 },
  KY: { dx: -0.1, dy: -0.1 },
  AL: { dy: 0.1 },
  GA: { dx: -0.05, dy: 0.1 },
  FL: { dy: 0.05 },
  SC: { dx: -0.05 },
  NC: { dx: -0.05 },
  MI: { dy: 0.12 },
  OH: { dx: 0.05, dy: 0.05 },
  WV: { dx: 0.05, dy: 0.1 },
  DE: { dy: 0.1 },
  NJ: { dx: 0.2, dy: 0.2 },
  PA: { dx: -0.2 },
  MA: { dx: 0.25, dy: -0.02 },
  CT: { dx: -0.05 },
  RI: { dy: -0.2 },
  NH: { dy: 0.1 },
  AK: { dx: 0.1 },
};

function applyNudge(abbr: string, [lon, lat]: Position, ring: Position[]): Position {
  const nudge = LABEL_NUDGES[abbr];
  if (!nudge) return [lon, lat];

  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [rLon, rLat] of ring) {
    minLon = Math.min(minLon, rLon);
    maxLon = Math.max(maxLon, rLon);
    minLat = Math.min(minLat, rLat);
    maxLat = Math.max(maxLat, rLat);
  }

  return [
    lon + (nudge.dx ?? 0) * (maxLon - minLon),
    lat + (nudge.dy ?? 0) * (maxLat - minLat),
  ];
}

/**
 * One label point per state, positioned via "pole of inaccessibility" (the point maximally
 * distant from the polygon's own edges) rather than a plain centroid — a centroid can land
 * outside an irregularly-shaped state entirely (e.g. Michigan's straddles Lake Michigan),
 * which is why CNN and most other US choropleths use this technique for state labels. For
 * multi-part states (islands, detached parts) only the largest part is used, so the label
 * doesn't end up positioned to represent some tiny disconnected sliver. Computed in
 * Mercator-projected space (see lonLatToMercator above), not raw lon/lat, to match how the
 * map actually renders.
 *
 * Computed from the same Alaska/Hawaii-remapped geometry the map itself renders, so labels
 * land on the insets rather than at AK/HI's real (off-screen) locations.
 */
export function getStateLabelsGeoJson(): FeatureCollection<Point, StateLabelProperties> {
  if (!cached) {
    const states = remapInsetStates(getUsStatesGeoJson(), (p) => p.abbr);
    const features: Feature<Point, StateLabelProperties>[] = [];

    for (const f of states.features) {
      if (!f.properties.abbr) continue;
      const rings = largestPolygonRings(f.geometry);
      if (!rings) continue;
      const projectedRings = rings.map((ring) => ring.map(lonLatToMercator));
      const [x, y] = polylabel(projectedRings as [number, number][][], 0.01);
      const point = applyNudge(f.properties.abbr, mercatorToLonLat([x, y]), rings[0]);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: point },
        properties: { abbr: f.properties.abbr, name: f.properties.name },
      });
    }

    cached = { type: "FeatureCollection", features };
  }
  return cached;
}

function largestPolygonRings(geom: Geometry): Position[][] | null {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") {
    let best: Position[][] | null = null;
    let bestArea = -Infinity;
    for (const coordinates of geom.coordinates) {
      const a = area({
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates },
      });
      if (a > bestArea) {
        bestArea = a;
        best = coordinates;
      }
    }
    return best;
  }
  return null;
}
