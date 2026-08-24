// Populates src/data/legislators.json from the `unitedstates/congress-legislators`
// public dataset (github.com/unitedstates/congress-legislators) — no API key needed.
// Stand-in for the eventual `legislators`/`terms` Supabase tables (plan §4) until
// Supabase sync jobs exist; run manually via `npm run sync:legislators`.
//
// Two source files:
// - legislators-current.yaml: currently serving members, each with their full term
//   history (all chambers) — kept in full, since the "Current representation" tab
//   needs current House terms too.
// - legislators-historical.yaml: former members (huge — ~9MB, every House member
//   back to 1789). We only need this for the Senate "history over time" tab, so
//   historical members are trimmed to their Senate terms only; their House terms
//   (and House-only historical members entirely) are dropped to keep the output
//   from ballooning with data nothing in the app displays yet. Revisit this scope
//   if a House-history feature ever gets built (plan's open decision, §8).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

const BASE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main";
const CURRENT_URL = `${BASE_URL}/legislators-current.yaml`;
const HISTORICAL_URL = `${BASE_URL}/legislators-historical.yaml`;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const outDir = path.join(root, "src", "data");
const outFile = path.join(outDir, "legislators.json");

function photoUrl(bioguideId) {
  return `https://unitedstates.github.io/images/congress/450x550/${bioguideId}.jpg`;
}

function chamberFor(termType) {
  if (termType === "sen") return "senate";
  if (termType === "rep") return "house";
  throw new Error(`Unknown term type: ${termType}`);
}

async function fetchYaml(url) {
  console.log(`Fetching ${url} ...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return loadYaml(await res.text());
}

function buildLegislator(person) {
  const bioguideId = person.id?.bioguide;
  if (!bioguideId) return null; // every member has one; skip malformed entries defensively
  return {
    id: bioguideId,
    bioguideId,
    govtrackId: person.id?.govtrack ?? null,
    firstName: person.name?.first ?? null,
    lastName: person.name?.last ?? null,
    photoUrl: photoUrl(bioguideId),
    birthday: person.bio?.birthday ?? null,
  };
}

function buildTerms(bioguideId, rawTerms, today, { onlySenate }) {
  return rawTerms
    .filter((term) => !onlySenate || term.type === "sen")
    .map((term, index) => ({
      id: `${bioguideId}-${index}`,
      legislatorId: bioguideId,
      chamber: chamberFor(term.type),
      stateId: term.state,
      district: term.type === "rep" ? (term.district ?? 0) : null,
      party: term.party ?? null,
      startDate: term.start,
      endDate: term.end,
      isCurrent: term.start <= today && today <= term.end,
    }));
}

async function main() {
  const [current, historical] = await Promise.all([
    fetchYaml(CURRENT_URL),
    fetchYaml(HISTORICAL_URL),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const legislators = [];
  const terms = [];
  const seenIds = new Set();

  for (const person of current) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue;
    seenIds.add(legislator.id);
    legislators.push(legislator);
    terms.push(...buildTerms(legislator.id, person.terms ?? [], today, { onlySenate: false }));
  }

  for (const person of historical) {
    const legislator = buildLegislator(person);
    if (!legislator || seenIds.has(legislator.id)) continue; // current takes precedence
    const senateTerms = buildTerms(legislator.id, person.terms ?? [], today, {
      onlySenate: true,
    });
    if (senateTerms.length === 0) continue; // House-only historical member — out of scope
    seenIds.add(legislator.id);
    legislators.push(legislator);
    terms.push(...senateTerms);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        sources: [CURRENT_URL, HISTORICAL_URL],
        generatedAt: new Date().toISOString(),
        legislators,
        terms,
      },
      null,
      2,
    ) + "\n",
  );

  console.log(
    `Wrote ${legislators.length} legislators / ${terms.length} terms -> ${path.relative(root, outFile)}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
