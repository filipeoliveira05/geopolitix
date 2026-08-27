import type { Feature, FeatureCollection, Geometry, Position } from "geojson";
import { getUsStatesGeoJson } from "./us-states-geo";

type Box = { minLon: number; minLat: number; maxLon: number; maxLat: number };

// Schematic (not geographically accurate) inset boxes south of California, where the
// continental US map has nothing else drawn — the same convention CNN's election map and
// most other US choropleths use, so viewing Alaska at its real size/location doesn't force
// zooming/panning out to a hemisphere-wide view for the other 49 states.
const ALASKA_TARGET: Box = { minLon: -124, minLat: 24, maxLon: -110, maxLat: 31 };
const HAWAII_TARGET: Box = { minLon: -109, minLat: 24, maxLon: -101, maxLat: 28 };

type Transform = {
  /** Alaska's westernmost Aleutian islands cross the antimeridian and are recorded as
   * positive longitudes (~172E) rather than continuing past -180 — left as-is, they'd blow
   * the bounding box out to nearly the whole globe. Wrapping them to lon-360 first makes the
   * whole state's coordinates span one contiguous range before measuring/scaling it. */
  normalizeAntimeridian: boolean;
  scale: number;
  srcCenter: [number, number];
  targetCenter: [number, number];
};

function walkCoords(geom: Geometry, fn: (c: Position) => void) {
  if (geom.type === "Polygon") {
    geom.coordinates.forEach((ring) => ring.forEach(fn));
  } else if (geom.type === "MultiPolygon") {
    geom.coordinates.forEach((poly) => poly.forEach((ring) => ring.forEach(fn)));
  }
}

function computeTransform(
  feature: Feature<Geometry>,
  normalizeAntimeridian: boolean,
  target: Box,
): Transform {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  walkCoords(feature.geometry, ([lon, lat]) => {
    const l = normalizeAntimeridian && lon > 0 ? lon - 360 : lon;
    minLon = Math.min(minLon, l);
    maxLon = Math.max(maxLon, l);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });

  const srcCenter: [number, number] = [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
  const scale = Math.min(
    (target.maxLon - target.minLon) / (maxLon - minLon),
    (target.maxLat - target.minLat) / (maxLat - minLat),
  );
  const targetCenter: [number, number] = [
    (target.minLon + target.maxLon) / 2,
    (target.minLat + target.maxLat) / 2,
  ];

  return { normalizeAntimeridian, scale, srcCenter, targetCenter };
}

function applyTransform([lon, lat]: Position, t: Transform): Position {
  const l = t.normalizeAntimeridian && lon > 0 ? lon - 360 : lon;
  const scaledLon = t.srcCenter[0] + (l - t.srcCenter[0]) * t.scale;
  const scaledLat = t.srcCenter[1] + (lat - t.srcCenter[1]) * t.scale;
  return [
    scaledLon + (t.targetCenter[0] - t.srcCenter[0]),
    scaledLat + (t.targetCenter[1] - t.srcCenter[1]),
  ];
}

function remapGeometry(geom: Geometry, t: Transform): Geometry {
  if (geom.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geom.coordinates.map((ring) => ring.map((c) => applyTransform(c, t))),
    };
  }
  if (geom.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geom.coordinates.map((poly) =>
        poly.map((ring) => ring.map((c) => applyTransform(c, t))),
      ),
    };
  }
  return geom;
}

let cachedTransforms: { AK: Transform; HI: Transform } | null = null;

function getTransforms() {
  if (!cachedTransforms) {
    const raw = getUsStatesGeoJson();
    const ak = raw.features.find((f) => f.properties.abbr === "AK");
    const hi = raw.features.find((f) => f.properties.abbr === "HI");
    if (!ak || !hi) throw new Error("Alaska/Hawaii geometry missing from us-atlas data");
    cachedTransforms = {
      AK: computeTransform(ak, true, ALASKA_TARGET),
      HI: computeTransform(hi, false, HAWAII_TARGET),
    };
  }
  return cachedTransforms;
}

/**
 * Repositions Alaska and Hawaii into the fixed insets above, leaving every other feature
 * untouched. Apply this once, right after loading raw state/district geometry and before any
 * further derived processing (e.g. senate-split intersection), so everything downstream —
 * fills, outlines, label points — agrees on where AK/HI actually are.
 */
export function remapInsetStates<P>(
  collection: FeatureCollection<Geometry, P>,
  getAbbr: (props: P) => string | null,
): FeatureCollection<Geometry, P> {
  const { AK, HI } = getTransforms();
  return {
    type: "FeatureCollection",
    features: collection.features.map((f) => {
      const abbr = getAbbr(f.properties);
      const t = abbr === "AK" ? AK : abbr === "HI" ? HI : null;
      if (!t) return f;
      return { ...f, geometry: remapGeometry(f.geometry, t) };
    }),
  };
}
