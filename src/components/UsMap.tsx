"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getUsStatesGeoJson } from "@/lib/us-states-geo";

// MapLibre resolves its worker script relative to its own bundled module's
// `import.meta.url`, which under Next.js points at an internal chunk with no
// sibling worker file — the worker then fails to load silently and no
// source ever finishes processing. `scripts/copy-maplibre-worker.mjs`
// (run via `postinstall`) copies the matching worker script into `public/`.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STATES_SOURCE_ID = "us-states";
const STATES_FILL_LAYER_ID = "us-states-fill";
const STATES_LINE_LAYER_ID = "us-states-line";

// No basemap tiles/API key — an empty style hosting only our GeoJSON layers,
// per the plan's goal of not depending on a paid map provider.
const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

// Continental US only. Plain lon/lat (Mercator) bounds can't frame AK/HI
// alongside the continental states without dwarfing them — an Albers-style
// composite projection (as CNN's map uses) would be needed for that; out of
// scope for this dev slice.
const US_BOUNDS: LngLatBoundsLike = [
  [-125, 24],
  [-66, 50],
];

type UsMapProps = {
  selectedAbbr: string | null;
  onSelectState: (abbr: string | null) => void;
};

export function UsMap({ selectedAbbr, onSelectState }: UsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectStateRef = useRef(onSelectState);

  useEffect(() => {
    onSelectStateRef.current = onSelectState;
  }, [onSelectState]);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: EMPTY_STYLE,
      bounds: US_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      map.addSource(STATES_SOURCE_ID, {
        type: "geojson",
        data: getUsStatesGeoJson(),
        promoteId: "fips",
      });

      map.addLayer({
        id: STATES_FILL_LAYER_ID,
        type: "fill",
        source: STATES_SOURCE_ID,
        paint: {
          "fill-color": "#60a5fa",
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.75,
            ["boolean", ["feature-state", "hover"], false],
            0.55,
            0.3,
          ],
        },
      });

      map.addLayer({
        id: STATES_LINE_LAYER_ID,
        type: "line",
        source: STATES_SOURCE_ID,
        paint: {
          "line-color": "#1e3a8a",
          "line-width": 1,
        },
      });

      let hoveredFeatureId: string | number | undefined;

      map.on("mousemove", STATES_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        if (!e.features?.length) return;
        const feature = e.features[0];
        if (hoveredFeatureId === feature.id) return;

        if (hoveredFeatureId !== undefined) {
          map.setFeatureState(
            { source: STATES_SOURCE_ID, id: hoveredFeatureId },
            { hover: false },
          );
        }
        hoveredFeatureId = feature.id;
        map.setFeatureState(
          { source: STATES_SOURCE_ID, id: hoveredFeatureId },
          { hover: true },
        );
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", STATES_FILL_LAYER_ID, () => {
        if (hoveredFeatureId !== undefined) {
          map.setFeatureState(
            { source: STATES_SOURCE_ID, id: hoveredFeatureId },
            { hover: false },
          );
        }
        hoveredFeatureId = undefined;
        map.getCanvas().style.cursor = "";
      });

      map.on("click", STATES_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const abbr = e.features?.[0]?.properties?.abbr as string | undefined;
        onSelectStateRef.current(abbr ?? null);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Reflect `selectedAbbr` as MapLibre feature-state so re-selecting from
  // the side panel (not just clicking the map) highlights the right state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applySelection = () => {
      const source = map.getSource(STATES_SOURCE_ID);
      if (!source) return;
      const data = getUsStatesGeoJson();
      for (const f of data.features) {
        map.setFeatureState(
          { source: STATES_SOURCE_ID, id: f.properties.fips },
          { selected: f.properties.abbr === selectedAbbr },
        );
      }
    };

    if (map.isStyleLoaded()) {
      applySelection();
    } else {
      map.once("load", applySelection);
    }
  }, [selectedAbbr]);

  return <div ref={containerRef} className="h-full w-full" />;
}
