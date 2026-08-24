import fipsToAbbr from "@/data/fips-to-abbr.json";

// Static US Census FIPS code <-> USPS state abbreviation mapping.
// Reference data (doesn't change), used to join us-atlas/TIGER geometries
// (keyed by FIPS) with our domain data (keyed by USPS abbreviation, per the
// plan's `states.id`). Shared with scripts/sync/districts.mjs, which reads
// src/data/fips-to-abbr.json directly (plain JSON, no TS import needed there).
export const FIPS_TO_ABBR: Record<string, string> = fipsToAbbr;
