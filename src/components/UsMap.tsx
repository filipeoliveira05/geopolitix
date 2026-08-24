"use client";

import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDistrictsGeoJson, type DistrictFeatureProperties } from "@/lib/districts-geo";
import { getCurrentRepsByDistrictKey } from "@/lib/legislators-data";
import { getSenateSplitGeoJson, getSenateHalfIdsByState } from "@/lib/senate-split-geo";
import { PARTY_COLORS, FALLBACK_PARTY_STYLE } from "@/lib/party-colors";
import type { FeatureCollection, Geometry } from "geojson";

// MapLibre resolves its worker script relative to its own bundled module's
// `import.meta.url`, which under Next.js points at an internal chunk with no
// sibling worker file — the worker then fails to load silently and no
// source ever finishes processing. `scripts/copy-maplibre-worker.mjs`
// (run via `postinstall`) copies the matching worker script into `public/`.
setWorkerUrl("/maplibre-gl-worker.mjs");

const DISTRICTS_SOURCE_ID = "us-districts";
const DISTRICTS_FILL_LAYER_ID = "us-districts-fill";
const DISTRICTS_LINE_LAYER_ID = "us-districts-line";

// The "States" mode shows each state's current Senate delegation (split by
// party where the two senators differ) — the Senate is the state-level
// chamber, the way the House is the district-level one shown in "Districts"
// mode. Source/layer ids keep the "senate" name since that's what the data
// actually is; the UI-facing mode/button label is "States".
const SENATE_SOURCE_ID = "us-senate";
const SENATE_FILL_LAYER_ID = "us-senate-fill";
const SENATE_LINE_LAYER_ID = "us-senate-line";

type MapMode = "states" | "districts";

// Shared by the districts and senate fill layers — both color by party.
// Built from src/lib/party-colors.ts (also used by PartyBadge.tsx) rather
// than hardcoding hex values here, so the map and the text badges can't
// silently drift out of sync.
function partyFillColor(): ExpressionSpecification {
  const stops = Object.entries(PARTY_COLORS).flatMap(([party, { hex }]) => [party, hex]);
  // Built dynamically from PARTY_COLORS, so TS can't verify the exact
  // "match" tuple shape the way it can for a literal array — the shape is
  // correct at runtime (party name / hex pairs + a trailing fallback).
  return ["match", ["get", "party"], ...stops, FALLBACK_PARTY_STYLE.hex] as unknown as ExpressionSpecification;
}

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
          "fill-color": partyFillColor(),
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

      map.addSource(SENATE_SOURCE_ID, {
        type: "geojson",
        data: getSenateSplitGeoJson(),
        promoteId: "id",
      });

      map.addLayer({
        id: SENATE_FILL_LAYER_ID,
        type: "fill",
        source: SENATE_SOURCE_ID,
        // Visible by default — "states" (Senate coloring) is the initial mode.
        paint: {
          "fill-color": partyFillColor(),
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
        id: SENATE_LINE_LAYER_ID,
        type: "line",
        source: SENATE_SOURCE_ID,
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

      // Each state is 1-2 features here (one per senator's half, or one
      // "whole" feature if it has fewer than 2 current senators) — hover and
      // selection should highlight every half belonging to the state under
      // the cursor together, not just the single half being pointed at.
      const senateHalfIdsByState = getSenateHalfIdsByState();
      let hoveredSenateStateId: string | undefined;

      map.on("mousemove", SENATE_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const stateId = e.features?.[0]?.properties?.stateId as string | undefined;
        if (!stateId || hoveredSenateStateId === stateId) return;

        if (hoveredSenateStateId) {
          for (const id of senateHalfIdsByState.get(hoveredSenateStateId) ?? []) {
            map.setFeatureState({ source: SENATE_SOURCE_ID, id }, { hover: false });
          }
        }
        hoveredSenateStateId = stateId;
        for (const id of senateHalfIdsByState.get(stateId) ?? []) {
          map.setFeatureState({ source: SENATE_SOURCE_ID, id }, { hover: true });
        }
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", SENATE_FILL_LAYER_ID, () => {
        if (hoveredSenateStateId) {
          for (const id of senateHalfIdsByState.get(hoveredSenateStateId) ?? []) {
            map.setFeatureState({ source: SENATE_SOURCE_ID, id }, { hover: false });
          }
        }
        hoveredSenateStateId = undefined;
        map.getCanvas().style.cursor = "";
      });

      map.on("click", SENATE_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const stateId = e.features?.[0]?.properties?.stateId as string | undefined;
        onSelectStateRef.current(stateId ?? null);
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
      const districtsVisibility = mode === "districts" ? "visible" : "none";
      const statesVisibility = mode === "states" ? "visible" : "none";
      map.setLayoutProperty(DISTRICTS_FILL_LAYER_ID, "visibility", districtsVisibility);
      map.setLayoutProperty(DISTRICTS_LINE_LAYER_ID, "visibility", districtsVisibility);
      map.setLayoutProperty(SENATE_FILL_LAYER_ID, "visibility", statesVisibility);
      map.setLayoutProperty(SENATE_LINE_LAYER_ID, "visibility", statesVisibility);
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
      const senateSource = map.getSource(SENATE_SOURCE_ID);
      if (!senateSource) return;
      for (const [stateId, ids] of getSenateHalfIdsByState()) {
        for (const id of ids) {
          map.setFeatureState(
            { source: SENATE_SOURCE_ID, id },
            { selected: stateId === selectedAbbr },
          );
        }
      }

      // The selected state changed via some other path (side panel, states
      // layer itself) — the previously-highlighted district, if any, no
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

      {mode === "states" && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-md border border-zinc-300 bg-white/90 p-2 text-xs text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300">
          <div className="font-medium">Current senators&apos; party</div>
          <LegendRow color="#2563eb" label="Democrat" />
          <LegendRow color="#dc2626" label="Republican" />
          <LegendRow color="#71717a" label="Independent" />
          <LegendRow color="#a1a1aa" label="No data / no senators" />
          <div className="mt-1 text-zinc-500 dark:text-zinc-400">
            Split states show both senators — senior senator top-left,
            junior bottom-right.
          </div>
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
