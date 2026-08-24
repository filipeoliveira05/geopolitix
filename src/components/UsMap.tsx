"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getUsStatesGeoJson } from "@/lib/us-states-geo";
import { getDistrictsGeoJson, type DistrictFeatureProperties } from "@/lib/districts-geo";
import { getCurrentRepsByDistrictKey } from "@/lib/legislators-data";
import type { FeatureCollection, Geometry } from "geojson";

// MapLibre resolves its worker script relative to its own bundled module's
// `import.meta.url`, which under Next.js points at an internal chunk with no
// sibling worker file — the worker then fails to load silently and no
// source ever finishes processing. `scripts/copy-maplibre-worker.mjs`
// (run via `postinstall`) copies the matching worker script into `public/`.
setWorkerUrl("/maplibre-gl-worker.mjs");

const STATES_SOURCE_ID = "us-states";
const STATES_FILL_LAYER_ID = "us-states-fill";
const STATES_LINE_LAYER_ID = "us-states-line";

const DISTRICTS_SOURCE_ID = "us-districts";
const DISTRICTS_FILL_LAYER_ID = "us-districts-fill";
const DISTRICTS_LINE_LAYER_ID = "us-districts-line";

type MapMode = "states" | "districts";

type DistrictProperties = DistrictFeatureProperties & {
  party: string | null;
  repName: string | null;
};

/** Joins district geometry with the current House member's party for map coloring. */
function getDistrictsWithReps(): FeatureCollection<Geometry, DistrictProperties> {
  const repsByDistrict = getCurrentRepsByDistrictKey();
  const districts = getDistrictsGeoJson();
  return {
    type: "FeatureCollection",
    features: districts.features.map((f) => {
      const rep = repsByDistrict.get(`${f.properties.stateId}-${f.properties.district}`);
      return {
        ...f,
        properties: {
          ...f.properties,
          party: rep?.term.party ?? null,
          repName: rep
            ? [rep.legislator.firstName, rep.legislator.lastName].filter(Boolean).join(" ")
            : null,
        },
      };
    }),
  };
}

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
  // `district` is omitted (or null) when selecting via the states layer —
  // only a districts-layer click identifies a specific district.
  onSelectState: (abbr: string | null, district?: number | null) => void;
};

/** Wires hover (feature-state) on a fill layer. Used for both the states and districts layers. */
function setupHover(map: MapLibreMap, sourceId: string, fillLayerId: string) {
  let hoveredFeatureId: string | number | undefined;

  map.on("mousemove", fillLayerId, (e: MapLayerMouseEvent) => {
    if (!e.features?.length) return;
    const feature = e.features[0];
    if (hoveredFeatureId === feature.id) return;

    if (hoveredFeatureId !== undefined) {
      map.setFeatureState({ source: sourceId, id: hoveredFeatureId }, { hover: false });
    }
    hoveredFeatureId = feature.id;
    map.setFeatureState({ source: sourceId, id: hoveredFeatureId }, { hover: true });
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", fillLayerId, () => {
    if (hoveredFeatureId !== undefined) {
      map.setFeatureState({ source: sourceId, id: hoveredFeatureId }, { hover: false });
    }
    hoveredFeatureId = undefined;
    map.getCanvas().style.cursor = "";
  });
}

export function UsMap({ selectedAbbr, onSelectState }: UsMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectStateRef = useRef(onSelectState);
  // Tracks which single district is highlighted on the districts layer —
  // separate from `selectedAbbr` (state-level, shared with the side panel)
  // since a state can contain many districts and only the clicked one
  // should be outlined.
  const selectedDistrictRef = useRef<{ id: string | number; stateId: string } | null>(
    null,
  );
  const [mode, setMode] = useState<MapMode>("states");

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

      setupHover(map, STATES_SOURCE_ID, STATES_FILL_LAYER_ID);
      map.on("click", STATES_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const abbr = e.features?.[0]?.properties?.abbr as string | undefined;
        onSelectStateRef.current(abbr ?? null);
      });

      map.addSource(DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: getDistrictsWithReps(),
        promoteId: "geoid",
      });

      map.addLayer({
        id: DISTRICTS_FILL_LAYER_ID,
        type: "fill",
        source: DISTRICTS_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "fill-color": [
            "match",
            ["get", "party"],
            "Democrat",
            "#2563eb",
            "Republican",
            "#dc2626",
            "Independent",
            "#71717a",
            "#a1a1aa",
          ],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            0.95,
            ["boolean", ["feature-state", "hover"], false],
            0.85,
            0.6,
          ],
        },
      });

      map.addLayer({
        id: DISTRICTS_LINE_LAYER_ID,
        type: "line",
        source: DISTRICTS_SOURCE_ID,
        layout: { visibility: "none" },
        paint: {
          "line-color": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            "#0f172a",
            "#ffffff",
          ],
          "line-width": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            3,
            0.5,
          ],
        },
      });

      setupHover(map, DISTRICTS_SOURCE_ID, DISTRICTS_FILL_LAYER_ID);
      map.on("click", DISTRICTS_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        const stateId = feature?.properties?.stateId as string | undefined;
        const district = feature?.properties?.district as number | null | undefined;

        const previous = selectedDistrictRef.current;
        if (previous) {
          map.setFeatureState(
            { source: DISTRICTS_SOURCE_ID, id: previous.id },
            { selected: false },
          );
        }
        if (feature && stateId) {
          map.setFeatureState(
            { source: DISTRICTS_SOURCE_ID, id: feature.id! },
            { selected: true },
          );
          selectedDistrictRef.current = { id: feature.id!, stateId };
        } else {
          selectedDistrictRef.current = null;
        }

        onSelectStateRef.current(stateId ?? null, district ?? null);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle which layer set is visible when the states/districts mode changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const applyMode = () => {
      const statesVisibility = mode === "states" ? "visible" : "none";
      const districtsVisibility = mode === "districts" ? "visible" : "none";
      map.setLayoutProperty(STATES_FILL_LAYER_ID, "visibility", statesVisibility);
      map.setLayoutProperty(STATES_LINE_LAYER_ID, "visibility", statesVisibility);
      map.setLayoutProperty(DISTRICTS_FILL_LAYER_ID, "visibility", districtsVisibility);
      map.setLayoutProperty(DISTRICTS_LINE_LAYER_ID, "visibility", districtsVisibility);
    };

    if (map.isStyleLoaded()) {
      applyMode();
    } else {
      map.once("load", applyMode);
    }
  }, [mode]);

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

      // The selected state changed via some other path (states layer,
      // side panel) — the previously-highlighted district, if any, no
      // longer belongs to the selected state, so clear its highlight too.
      const selectedDistrict = selectedDistrictRef.current;
      if (selectedDistrict && selectedDistrict.stateId !== selectedAbbr) {
        map.setFeatureState(
          { source: DISTRICTS_SOURCE_ID, id: selectedDistrict.id },
          { selected: false },
        );
        selectedDistrictRef.current = null;
      }
    };

    if (map.isStyleLoaded()) {
      applySelection();
    } else {
      map.once("load", applySelection);
    }
  }, [selectedAbbr]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <div className="absolute top-3 left-3 flex overflow-hidden rounded-md border border-zinc-300 text-sm shadow-sm dark:border-zinc-700">
        {(["states", "districts"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-3 py-1.5 capitalize transition-colors ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {mode === "districts" && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-zinc-300 bg-white/90 p-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300">
          <div className="font-medium">Current House rep&apos;s party</div>
          <LegendRow color="#2563eb" label="Democrat" />
          <LegendRow color="#dc2626" label="Republican" />
          <LegendRow color="#71717a" label="Independent" />
          <LegendRow color="#a1a1aa" label="No data" />
        </div>
      )}
    </div>
  );
}

function LegendRow({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </div>
  );
}
