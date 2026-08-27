"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  Marker,
  setWorkerUrl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getDistrictsGeoJson, type DistrictFeatureProperties } from "@/lib/districts-geo";
import { getCurrentRepsByDistrictKey, type TermWithLegislator } from "@/lib/legislators-data";
import { getSenateSplitGeoJson, getSenateHalfIdsByState } from "@/lib/senate-split-geo";
import { getStateLabelsGeoJson } from "@/lib/state-labels-geo";
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
async function joinDistrictsWithReps(
  repsByDistrict: Map<string, TermWithLegislator>,
): Promise<FeatureCollection<Geometry, DistrictProperties>> {
  const districts = await getDistrictsGeoJson();
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

// Continental US framing — Alaska and Hawaii are repositioned into fixed insets within this
// same box by src/lib/us-insets.ts, rather than shown at their real (much farther away)
// location, so this doesn't need to be a hemisphere-spanning view.
const US_BOUNDS: LngLatBoundsLike = [
  [-125, 24],
  [-66, 50],
];

// Caps how far the map can be panned/zoomed out — without this, MapLibre's default Mercator
// world wraps horizontally, so zooming out enough shows the same US map repeated side by
// side. Generously larger than US_BOUNDS (not just padded) — a narrow/portrait viewport's
// fitBounds naturally reveals a lot of extra latitude on top of the bounds' own 59°x26°, and
// too-tight a maxBounds forces MapLibre to zoom in past what fitBounds asked for to keep the
// viewport inside it, cropping the initial view on phones.
const MAX_PAN_BOUNDS: LngLatBoundsLike = [
  [-160, -10],
  [-30, 72],
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
  // Resolves once the "load" handler's data fetches finish and every layer
  // has been added — the "load" event itself fires as soon as the map style
  // is ready, well before that, so other effects (mode toggling, selection)
  // must await this rather than the map's own `isStyleLoaded()`/"load", or
  // they can race ahead and try to style layers that don't exist yet.
  const layersReadyRef = useRef<Promise<void> | null>(null);
  const labelMarkersRef = useRef<Marker[]>([]);
  const [mode, setMode] = useState<MapMode>("states");

  useEffect(() => {
    onSelectStateRef.current = onSelectState;
  }, [onSelectState]);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;
    let resolveLayersReady: () => void = () => {};
    layersReadyRef.current = new Promise((resolve) => {
      resolveLayersReady = resolve;
    });
    const map = new MapLibreMap({
      container: containerRef.current,
      style: EMPTY_STYLE,
      bounds: US_BOUNDS,
      fitBoundsOptions: { padding: 24 },
      attributionControl: false,
      maxBounds: MAX_PAN_BOUNDS,
      // Otherwise Mercator wraps horizontally — zooming out far enough shows the same US map
      // repeated side by side (there's nothing else in this empty-style world to signal
      // there's only one to look at).
      renderWorldCopies: false,
    });
    mapRef.current = map;

    map.on("load", async () => {
      const repsByDistrict = await getCurrentRepsByDistrictKey();
      const districtsWithReps = await joinDistrictsWithReps(repsByDistrict);
      // The effect's cleanup (StrictMode's mount/unmount/remount in dev, or
      // a real unmount) can run before this resolves — map.addSource below
      // would throw on an already-removed map.
      if (cancelled) return;

      map.addSource(DISTRICTS_SOURCE_ID, {
        type: "geojson",
        data: districtsWithReps,
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

      const senateGeoJson = await getSenateSplitGeoJson();
      if (cancelled) return;

      map.addSource(SENATE_SOURCE_ID, {
        type: "geojson",
        data: senateGeoJson,
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
      const senateHalfIdsByState = await getSenateHalfIdsByState();
      if (cancelled) return;
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

      // Plain DOM markers rather than a MapLibre symbol layer — a symbol layer's text needs a
      // glyphs (SDF font) URL wired into the style, which would mean depending on an external
      // glyph server at runtime; markers just need CSS, and give free light/dark theming.
      for (const labelFeature of getStateLabelsGeoJson().features) {
        const el = document.createElement("div");
        el.textContent = labelFeature.properties.abbr;
        el.className =
          "pointer-events-none select-none text-[10px] font-bold text-zinc-900/90 dark:text-zinc-50/90 drop-shadow-[0_1px_1px_rgba(255,255,255,0.9)] dark:drop-shadow-[0_1px_1px_rgba(0,0,0,0.9)]";
        const marker = new Marker({ element: el, anchor: "center" })
          .setLngLat(labelFeature.geometry.coordinates as [number, number])
          .addTo(map);
        labelMarkersRef.current.push(marker);
      }

      resolveLayersReady();
    });

    return () => {
      cancelled = true;
      for (const marker of labelMarkersRef.current) marker.remove();
      labelMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Toggle which layer set is visible when the states/districts mode changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    (async () => {
      await layersReadyRef.current;
      if (cancelled) return;
      const districtsVisibility = mode === "districts" ? "visible" : "none";
      const statesVisibility = mode === "states" ? "visible" : "none";
      map.setLayoutProperty(DISTRICTS_FILL_LAYER_ID, "visibility", districtsVisibility);
      map.setLayoutProperty(DISTRICTS_LINE_LAYER_ID, "visibility", districtsVisibility);
      map.setLayoutProperty(SENATE_FILL_LAYER_ID, "visibility", statesVisibility);
      map.setLayoutProperty(SENATE_LINE_LAYER_ID, "visibility", statesVisibility);
    })();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  // Reflect `selectedAbbr` as MapLibre feature-state so re-selecting from
  // the side panel (not just clicking the map) highlights the right state.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    let cancelled = false;
    const applySelection = async () => {
      await layersReadyRef.current;
      if (cancelled) return;
      const senateHalfIdsByState = await getSenateHalfIdsByState();
      if (cancelled) return;
      for (const [stateId, ids] of senateHalfIdsByState) {
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

    applySelection();

    return () => {
      cancelled = true;
    };
  }, [selectedAbbr]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      <Link
        href="/midterms-2026"
        className="absolute top-2 right-2 rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs shadow-sm hover:bg-zinc-100 sm:top-3 sm:right-3 sm:px-3 sm:py-1.5 sm:text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
      >
        2026 Midterms
      </Link>

      <div className="absolute top-2 left-2 flex overflow-hidden rounded-md border border-zinc-300 text-xs shadow-sm sm:top-3 sm:left-3 sm:text-sm dark:border-zinc-700">
        {(["states", "districts"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`px-2 py-1 capitalize transition-colors sm:px-3 sm:py-1.5 ${
              mode === m
                ? "bg-blue-600 text-white"
                : "bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="absolute bottom-2 right-2 flex flex-col overflow-hidden rounded-md border border-zinc-300 text-sm shadow-sm sm:bottom-3 sm:right-3 dark:border-zinc-700">
        <button
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Zoom in"
          className="border-b border-zinc-300 bg-white px-2.5 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          +
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Zoom out"
          className="bg-white px-2.5 py-1.5 font-medium text-zinc-700 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          −
        </button>
      </div>

      {mode === "districts" && (
        <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-md border border-zinc-300 bg-white/90 p-1.5 text-[11px] shadow-sm sm:bottom-3 sm:left-3 sm:max-w-none sm:p-2 sm:text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300">
          <div className="font-medium">Current House rep&apos;s party</div>
          <LegendRow color="#2563eb" label="Democrat" />
          <LegendRow color="#dc2626" label="Republican" />
          <LegendRow color="#71717a" label="Independent" />
          <LegendRow color="#a1a1aa" label="No data" />
        </div>
      )}

      {mode === "states" && (
        <div className="absolute bottom-2 left-2 flex max-w-[calc(100%-1rem)] flex-col gap-1 rounded-md border border-zinc-300 bg-white/90 p-1.5 text-[11px] shadow-sm sm:bottom-3 sm:left-3 sm:max-w-none sm:p-2 sm:text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900/90 dark:text-zinc-300">
          <div className="font-medium">Current senators&apos; party</div>
          <LegendRow color="#2563eb" label="Democrat" />
          <LegendRow color="#dc2626" label="Republican" />
          <LegendRow color="#71717a" label="Independent" />
          <LegendRow color="#a1a1aa" label="No data / no senators" />
          <div className="mt-1 hidden text-zinc-500 sm:block dark:text-zinc-400">
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
