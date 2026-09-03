"use client";

import { useEffect, useRef } from "react";
import {
  Map as MapLibreMap,
  setWorkerUrl,
  type StyleSpecification,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
  type ExpressionSpecification,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { getUsStatesGeoJson } from "@/lib/us-states-geo";
import { remapInsetStates } from "@/lib/us-insets";

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
  onSelectState: (abbr: string) => void;
  feedback: MapClickFeedback;
}) {
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
        if (abbr) onSelectStateRef.current(abbr);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Applies/clears the correct-target (green) and wrong-click (red) highlighting — only ever
  // runs once the map has actually loaded, since `feedback` can only become non-null as a
  // reaction to a click event the map itself fired, which can't happen before "load".
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !feedback) return;
    map.setFeatureState(
      { source: SOURCE_ID, id: feedback.targetStateId },
      { result: "correct-target" },
    );
    if (!feedback.correct && feedback.clickedStateId !== feedback.targetStateId) {
      map.setFeatureState({ source: SOURCE_ID, id: feedback.clickedStateId }, { result: "wrong-click" });
    }
    return () => {
      map.setFeatureState({ source: SOURCE_ID, id: feedback.targetStateId }, { result: null });
      if (!feedback.correct && feedback.clickedStateId !== feedback.targetStateId) {
        map.setFeatureState({ source: SOURCE_ID, id: feedback.clickedStateId }, { result: null });
      }
    };
  }, [feedback]);

  return (
    <div ref={containerRef} className="h-80 w-full overflow-hidden rounded border border-rule" />
  );
}
