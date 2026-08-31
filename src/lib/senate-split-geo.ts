import bbox from "@turf/bbox";
import intersect from "@turf/intersect";
import { polygon, featureCollection } from "@turf/helpers";
import type { Feature, FeatureCollection, Geometry, Polygon, MultiPolygon } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";
import { remapInsetStates } from "./us-insets";
import { getSenatorsByStateMap } from "./legislators-data";

export type SenateHalfProperties = {
  id: string;
  stateId: string;
  half: "topLeft" | "bottomRight" | "whole";
  party: string | null;
  senatorName: string | null;
};

const cache = new Map<string, Promise<FeatureCollection<Geometry, SenateHalfProperties>>>();

/**
 * Splits each state's real geometry (not just its bounding box) into two
 * halves along a diagonal, one per senator, clipped to the actual state
 * shape via polygon intersection — so multi-part states (islands, etc.)
 * still render correctly. A state renders as a single "whole" feature
 * instead of a split when there's nothing to show a split *for*: fewer
 * than 2 senators for that date (DC, a vacancy), or both senators sharing
 * the same party (the split would just be two triangles of the same
 * color). `asOfDate` (`null` = current) selects which point in time —
 * cached per date, like legislators-data.ts's own asOf caches, so
 * switching the home map's year dropdown back to an already-viewed year
 * doesn't refetch or rebuild the clipped geometry again.
 */
export function getSenateSplitGeoJson(
  asOfDate: string | null,
): Promise<FeatureCollection<Geometry, SenateHalfProperties>> {
  const key = asOfDate ?? "current";
  let cached = cache.get(key);
  if (!cached) {
    cached = buildSenateSplitGeoJson(asOfDate);
    cache.set(key, cached);
  }
  return cached;
}

async function buildSenateSplitGeoJson(
  asOfDate: string | null,
): Promise<FeatureCollection<Geometry, SenateHalfProperties>> {
  const senatorsByState = await getSenatorsByStateMap(asOfDate);
  const features: Feature<Geometry, SenateHalfProperties>[] = [];

  const statesGeoJson = remapInsetStates(getUsStatesGeoJson(), (p) => p.abbr);

  for (const stateFeature of statesGeoJson.features) {
    const abbr = stateFeature.properties.abbr;
    if (!abbr) continue;

    const senators = (senatorsByState.get(abbr) ?? []).sort((a, b) => {
      // Senior senator (earlier current-term start date) first, for a
      // stable, meaningful assignment rather than an arbitrary one.
      const byDate = a.term.startDate.localeCompare(b.term.startDate);
      return byDate !== 0 ? byDate : a.legislator.id.localeCompare(b.legislator.id);
    });

    const sameParty =
      senators.length === 2 && senators[0].term.party === senators[1].term.party;

    if (senators.length < 2 || sameParty) {
      features.push({
        type: "Feature",
        properties: {
          id: `${abbr}-whole`,
          stateId: abbr,
          half: "whole",
          party: senators[0]?.term.party ?? null,
          senatorName: senators
            .map((s) => [s.legislator.firstName, s.legislator.lastName].filter(Boolean).join(" "))
            .join(" & ") || null,
        },
        geometry: stateFeature.geometry,
      });
      continue;
    }

    const stateGeom = stateFeature.geometry as Polygon | MultiPolygon;
    const [minX, minY, maxX, maxY] = bbox(stateFeature as Feature<Polygon | MultiPolygon>);
    const topLeft = polygon([
      [
        [minX, maxY],
        [maxX, maxY],
        [minX, minY],
        [minX, maxY],
      ],
    ]);
    const bottomRight = polygon([
      [
        [maxX, maxY],
        [maxX, minY],
        [minX, minY],
        [maxX, maxY],
      ],
    ]);

    const stateAsFeature = { type: "Feature" as const, properties: {}, geometry: stateGeom };
    const topLeftClip = intersect(featureCollection([stateAsFeature, topLeft]));
    const bottomRightClip = intersect(featureCollection([stateAsFeature, bottomRight]));

    const [senatorA, senatorB] = senators;
    const halves: [typeof topLeftClip, "topLeft" | "bottomRight", (typeof senators)[number]][] =
      [
        [topLeftClip, "topLeft", senatorA],
        [bottomRightClip, "bottomRight", senatorB],
      ];

    for (const [clip, half, senator] of halves) {
      if (!clip) continue; // shouldn't happen (bbox triangles always overlap the shape), but be defensive
      features.push({
        type: "Feature",
        properties: {
          id: `${abbr}-${half}`,
          stateId: abbr,
          half,
          party: senator.term.party,
          senatorName: [senator.legislator.firstName, senator.legislator.lastName]
            .filter(Boolean)
            .join(" "),
        },
        geometry: clip.geometry,
      });
    }
  }

  return { type: "FeatureCollection", features };
}

/**
 * Maps stateId -> its half feature ids (1 or 2 of them) — so the map can
 * highlight both halves of a state together on hover/selection instead of
 * just the one half under the cursor.
 */
export async function getSenateHalfIdsByState(
  asOfDate: string | null,
): Promise<Map<string, string[]>> {
  const geojson = await getSenateSplitGeoJson(asOfDate);
  const map = new Map<string, string[]>();
  for (const f of geojson.features) {
    const { stateId, id } = f.properties;
    const existing = map.get(stateId);
    if (existing) existing.push(id);
    else map.set(stateId, [id]);
  }
  return map;
}
