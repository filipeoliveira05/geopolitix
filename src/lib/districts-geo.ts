import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import districtsData from "@/data/districts.json";

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

const data = districtsData as unknown as DistrictsFile;

let cached: FeatureCollection<Geometry, DistrictFeatureProperties> | null = null;

/**
 * Current (119th Congress) US House district boundaries, synced from the
 * Census cartographic boundary file via `npm run sync:districts` (see
 * scripts/sync/districts.mjs) — stand-in for the Supabase `districts` table
 * (plan §4) until that sync job exists for real.
 */
export function getDistrictsGeoJson(): FeatureCollection<
  Geometry,
  DistrictFeatureProperties
> {
  if (!cached) {
    const districtsObject = data.topology.objects.districts as GeometryCollection;
    cached = feature(data.topology, districtsObject) as unknown as FeatureCollection<
      Geometry,
      DistrictFeatureProperties
    >;
  }
  return cached;
}

export const districtsSyncedAt = data.generatedAt;
