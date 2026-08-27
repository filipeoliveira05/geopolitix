import area from "@turf/area";
import polylabel from "polylabel";
import type { Feature, FeatureCollection, Geometry, Point, Position } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";
import { remapInsetStates } from "./us-insets";

export type StateLabelProperties = { abbr: string; name: string };

let cached: FeatureCollection<Point, StateLabelProperties> | null = null;

/**
 * One label point per state, positioned via "pole of inaccessibility" (the point maximally
 * distant from the polygon's own edges) rather than a plain centroid — a centroid can land
 * outside an irregularly-shaped state entirely (e.g. Michigan's straddles Lake Michigan),
 * which is why CNN and most other US choropleths use this technique for state labels. For
 * multi-part states (islands, detached parts) only the largest part is used, so the label
 * doesn't end up positioned to represent some tiny disconnected sliver.
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
      const [lon, lat] = polylabel(rings as [number, number][][], 0.01);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [lon, lat] },
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
