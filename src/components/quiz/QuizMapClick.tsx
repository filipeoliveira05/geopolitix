"use client";

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
import { getUsStatesGeoJson } from "@/lib/us-states-geo";
import { remapInsetStates } from "@/lib/us-insets";
import { getStateLabelsGeoJson } from "@/lib/state-labels-geo";

// Same worker-resolution gotcha UsMap.tsx already documents and fixes — MapLibre resolves its
// worker relative to its own bundled module's import.meta.url, which points at an internal
// Next.js chunk with no sibling worker file under Turbopack. The worker file itself is already
// copied into public/ by scripts/copy-maplibre-worker.mjs (postinstall) for UsMap's own use;
// this component reuses that same copy, not a second one.
setWorkerUrl("/maplibre-gl-worker.mjs");

const EMPTY_STYLE: StyleSpecification = { version: 8, sources: {}, layers: [] };

// Same continental-US framing as UsMap.tsx (see its own comment) — Alaska/Hawaii are
// repositioned into fixed insets within this box by remapInsetStates, not shown at their real,
// much-farther-away location.
const US_BOUNDS: LngLatBoundsLike = [
  [-125, 24],
  [-66, 50],
];

// Same generous overshoot as UsMap.tsx's MAX_PAN_BOUNDS — without this, MapLibre's default
// Mercator world wraps horizontally when zoomed out.
const MAX_PAN_BOUNDS: LngLatBoundsLike = [
  [-160, -10],
  [-30, 72],
];

const SOURCE_ID = "quiz-states";
const FILL_LAYER_ID = "quiz-states-fill";
const LINE_LAYER_ID = "quiz-states-line";

// Flat --seal light-mode hex (see globals.css) — WebGL paint expressions can't read CSS custom
// properties, and UsMap.tsx's own party-fill colors are equally not dark-mode-aware today (see
// party-colors.ts), so this matches existing precedent rather than being a new gap.
const BASE_FILL_COLOR = "#8c6a2f";
const CORRECT_FILL_COLOR = "#16a34a";
const WRONG_FILL_COLOR = "#dc2626";

function fillColorExpression(): ExpressionSpecification {
  return [
    "case",
    ["==", ["feature-state", "result"], "correct-target"],
    CORRECT_FILL_COLOR,
    ["==", ["feature-state", "result"], "wrong-click"],
    WRONG_FILL_COLOR,
    BASE_FILL_COLOR,
  ];
}

function fillOpacityExpression(): ExpressionSpecification {
  return [
    "case",
    ["==", ["feature-state", "result"], "correct-target"],
    0.75,
    ["==", ["feature-state", "result"], "wrong-click"],
    0.75,
    ["boolean", ["feature-state", "hover"], false],
    0.5,
    0.15,
  ];
}

export type MapClickFeedback = {
  clickedStateId: string;
  targetStateId: string;
  correct: boolean;
} | null;

export function QuizMapClick({
  onSelectState,
  feedback,
}: {
  // Passes the clicked state's own display name alongside its abbreviation — the "wrong state,
  // you clicked on X" reveal message needs a human-readable name, which is only available from the
  // clicked map feature itself at click time, not precomputable at question-build time.
  onSelectState: (abbr: string, name: string) => void;
  feedback: MapClickFeedback;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const onSelectStateRef = useRef(onSelectState);
  // Tracks whether the underlying MapLibre instance has already been torn down by the mount
  // effect's own cleanup (map.remove()) — caught live: on unmount, the feedback effect's cleanup
  // below can run against a `map` that's already been removed (its internal style/source manager
  // torn down), and calling setFeatureState on it throws "Cannot read properties of undefined"
  // instead of silently no-op-ing. This flag lets that cleanup skip itself once removal has
  // already happened, regardless of which effect's cleanup React happens to run first.
  const removedRef = useRef(false);
  const labelMarkersRef = useRef<Marker[]>([]);
  // Tracks whether this map instance's "load" event (and the source/layers it adds) has actually
  // fired yet — MapClickQuestionView mounts this component before the player answers, so by the
  // time `feedback` goes non-null the map has long since loaded. A reveal-only caller (e.g.
  // MultipleChoiceQuestionView's silhouette reveal) mounts this component for the first time
  // ALREADY carrying non-null feedback, so the feedback effect below can otherwise race the
  // asynchronous "load" event and call setFeatureState before SOURCE_ID exists — caught live as a
  // console "Style is not done loading" error that silently ate the highlight via the error
  // boundary. Gating the feedback effect on this flag defers it until load actually completes.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    onSelectStateRef.current = onSelectState;
  }, [onSelectState]);

  useEffect(() => {
    if (!containerRef.current) return;
    // Reset here, not just set to true in this same effect's own cleanup below — React's
    // development-mode Strict Mode double-invokes this effect once on initial mount (mount →
    // cleanup → mount again), and without resetting on the second real mount, removedRef stays
    // `true` forever, permanently no-oping the feedback effect's cleanup below from then on.
    // Caught live: every map-click question after the first left its coloring uncleared on the
    // next question, since the "already removed" guard was skipping every real cleanup.
    removedRef.current = false;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: EMPTY_STYLE,
      bounds: US_BOUNDS,
      fitBoundsOptions: { padding: 16 },
      attributionControl: false,
      maxBounds: MAX_PAN_BOUNDS,
      renderWorldCopies: false,
    });
    mapRef.current = map;

    map.on("load", () => {
      const raw = getUsStatesGeoJson();
      const remapped = remapInsetStates(raw, (props) => props.abbr);
      map.addSource(SOURCE_ID, { type: "geojson", data: remapped, promoteId: "abbr" });
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: SOURCE_ID,
        paint: {
          "fill-color": fillColorExpression(),
          "fill-opacity": fillOpacityExpression(),
        },
      });
      map.addLayer({
        id: LINE_LAYER_ID,
        type: "line",
        source: SOURCE_ID,
        paint: { "line-color": BASE_FILL_COLOR, "line-width": 0.5 },
      });

      let hoveredId: string | undefined;
      map.on("mousemove", FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const abbr = e.features?.[0]?.properties?.abbr as string | undefined;
        if (!abbr || hoveredId === abbr) return;
        if (hoveredId) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
        hoveredId = abbr;
        map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", FILL_LAYER_ID, () => {
        if (hoveredId) map.setFeatureState({ source: SOURCE_ID, id: hoveredId }, { hover: false });
        hoveredId = undefined;
        map.getCanvas().style.cursor = "";
      });
      map.on("click", FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const abbr = e.features?.[0]?.properties?.abbr as string | undefined;
        const name = e.features?.[0]?.properties?.name as string | undefined;
        if (abbr) onSelectStateRef.current(abbr, name ?? abbr);
      });

      setLoaded(true);
    });

    return () => {
      removedRef.current = true;
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
  }, []);

  // Applies/clears the correct-target (green) and wrong-click (red) highlighting. Gated on
  // `loaded`, not just `feedback` — see the `loaded` state's own doc comment above for why a
  // reveal-only caller can otherwise race the map's asynchronous "load" event.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !feedback || !loaded) return;
    map.setFeatureState(
      { source: SOURCE_ID, id: feedback.targetStateId },
      { result: "correct-target" },
    );
    const showWrongLabel = !feedback.correct && feedback.clickedStateId !== feedback.targetStateId;
    if (showWrongLabel) {
      map.setFeatureState({ source: SOURCE_ID, id: feedback.clickedStateId }, { result: "wrong-click" });
    }

    // Name labels for the state(s) feedback is about — just the correct state when right, both
    // when wrong — so the reveal names them directly on the map, not just in the text below it.
    const relevantAbbrs = new Set([feedback.targetStateId]);
    if (showWrongLabel) relevantAbbrs.add(feedback.clickedStateId);
    for (const labelFeature of getStateLabelsGeoJson().features) {
      if (!relevantAbbrs.has(labelFeature.properties.abbr)) continue;
      const el = document.createElement("div");
      el.textContent = labelFeature.properties.abbr;
      el.className =
        "pointer-events-none select-none text-xs font-bold text-white " +
        "[filter:drop-shadow(0_0_2px_rgba(0,0,0,0.8))_drop-shadow(0_0_2px_rgba(0,0,0,0.8))]";
      const marker = new Marker({ element: el, anchor: "center" })
        .setLngLat(labelFeature.geometry.coordinates as [number, number])
        .addTo(map);
      labelMarkersRef.current.push(marker);
    }

    return () => {
      for (const marker of labelMarkersRef.current) marker.remove();
      labelMarkersRef.current = [];
      if (removedRef.current) return; // map already torn down — nothing to clean up
      map.setFeatureState({ source: SOURCE_ID, id: feedback.targetStateId }, { result: null });
      if (showWrongLabel) {
        map.setFeatureState({ source: SOURCE_ID, id: feedback.clickedStateId }, { result: null });
      }
    };
  }, [feedback, loaded]);

  return (
    <div ref={containerRef} className="h-80 w-full overflow-hidden rounded border border-rule" />
  );
}
