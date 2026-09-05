import { neighbors } from "topojson-client";
import type { Topology, GeometryCollection, GeometryObject } from "topojson-specification";
import statesTopology from "us-atlas/states-10m.json";
import { FIPS_TO_ABBR } from "./state-fips";

/**
 * Real state-to-state land borders, derived from the same `us-atlas` topology
 * state-silhouette-geo.ts already uses — TopoJSON stores a shared border between two adjacent
 * polygons as one shared "arc" rather than duplicating it in both, so `topojson-client`'s own
 * `neighbors()` (built for exactly this) can tell two states are adjacent purely by checking
 * whether they reference a common arc, no floating-point coordinate-matching needed. This also
 * means only a genuinely shared EDGE counts, never a single shared corner point — e.g. Arizona/
 * Colorado/Utah/New Mexico's "Four Corners" meet at one point, and Utah correctly does NOT list
 * New Mexico as a neighbor here. Some resulting borders reflect real but visually surprising
 * legal boundaries (Delaware touches New Jersey across the Delaware River; Michigan touches
 * Wisconsin across Lake Michigan) — confirmed correct against real geography, not a data bug.
 */
let cachedNeighbors: Map<string, string[]> | null = null;

function getAllNeighbors(): Map<string, string[]> {
  if (!cachedNeighbors) {
    const topology = statesTopology as unknown as Topology;
    const geometries = (topology.objects.states as GeometryCollection).geometries;
    const neighborIndexes = neighbors(geometries as GeometryObject[]);
    const abbrByIndex = geometries.map((g) => FIPS_TO_ABBR[String(g.id)] ?? null);

    cachedNeighbors = new Map();
    geometries.forEach((_, i) => {
      const abbr = abbrByIndex[i];
      if (!abbr) return;
      const neighborAbbrs = neighborIndexes[i]
        .map((j) => abbrByIndex[j])
        .filter((a): a is string => a !== null);
      cachedNeighbors!.set(abbr, neighborAbbrs);
    });
  }
  return cachedNeighbors;
}

/** Every state that shares a real land (or legally-recognized water) border with `abbr`. */
export function getStateNeighborAbbrs(abbr: string): string[] {
  return getAllNeighbors().get(abbr) ?? [];
}
