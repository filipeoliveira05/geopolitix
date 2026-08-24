import { feature } from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";
import type { FeatureCollection, Geometry } from "geojson";
import statesTopology from "us-atlas/states-10m.json";
import { FIPS_TO_ABBR } from "./state-fips";

export type StateFeatureProperties = {
  fips: string;
  name: string;
  abbr: string | null;
};

/**
 * State boundary geometries (lon/lat, unprojected — suitable for MapLibre's
 * own Mercator projection), sourced from the `us-atlas` package (US Census
 * TIGER data pre-bundled as TopoJSON). Static/reference data, not synced.
 */
export function getUsStatesGeoJson(): FeatureCollection<
  Geometry,
  StateFeatureProperties
> {
  const topology = statesTopology as unknown as Topology;
  const statesObject = topology.objects.states as GeometryCollection;
  const collection = feature(topology, statesObject) as unknown as FeatureCollection<
    Geometry,
    { name: string }
  >;

  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const fips = String(f.id);
      return {
        ...f,
        properties: {
          fips,
          name: f.properties.name,
          abbr: FIPS_TO_ABBR[fips] ?? null,
        },
      };
    }),
  };
}
