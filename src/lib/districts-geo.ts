import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import { remapInsetStates } from "./us-insets";

export type DistrictFeatureProperties = {
  stateId: string;
  district: number | null;
  geoid: string;
};

type DistrictsFile = {
  source: string;
  generatedAt: string;
  topology: Topology;
};

// Public Storage URL, not a Postgres table — the combined topology blob is
// one static rendering asset (~2.5MB, shares borders between adjacent
// districts — a fraction of the ~13MB independent per-row GeoJSON would
// cost), not per-row relational data. See scripts/sync/districts.mjs and
// CLAUDE.md's Data conventions for why.
const STORAGE_URL = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/district-geometry/topology.json`;

let cachedPromise: Promise<FeatureCollection<Geometry, DistrictFeatureProperties>> | null = null;

/**
 * Current (119th Congress) US House district boundaries, synced from the
 * Census cartographic boundary file via `npm run sync:districts` (see
 * scripts/sync/districts.mjs).
 */
export function getDistrictsGeoJson(): Promise<
  FeatureCollection<Geometry, DistrictFeatureProperties>
> {
  if (!cachedPromise) cachedPromise = fetchDistrictsGeoJson();
  return cachedPromise;
}

async function fetchDistrictsGeoJson(): Promise<
  FeatureCollection<Geometry, DistrictFeatureProperties>
> {
  const res = await fetch(STORAGE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch district geometry: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as DistrictsFile;
  const districtsObject = data.topology.objects.districts as GeometryCollection;
  const districtsGeoJson = feature(data.topology, districtsObject) as unknown as FeatureCollection<
    Geometry,
    DistrictFeatureProperties
  >;
  return remapInsetStates(districtsGeoJson, (p) => p.stateId);
}
