// Populates src/data/legislators.json from the `unitedstates/congress-legislators`
// public dataset (github.com/unitedstates/congress-legislators) — no API key needed.
// Stand-in for the eventual `legislators`/`terms` Supabase tables (plan §4) until
// Supabase sync jobs exist; run manually via `npm run sync:legislators`.
//
// Only legislators-current.yaml is used for now (currently serving members, each
// with their own full term history) — legislators-historical.yaml (former members)
// is left for later per the plan's open decision on how far back to go (§8).
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { load as loadYaml } from "js-yaml";

const SOURCE_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";

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

async function main() {
  console.log(`Fetching ${SOURCE_URL} ...`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch legislators data: ${res.status} ${res.statusText}`);
  }
  const raw = loadYaml(await res.text());

  const today = new Date().toISOString().slice(0, 10);
  const legislators = [];
  const terms = [];

  for (const person of raw) {
    const bioguideId = person.id?.bioguide;
    if (!bioguideId) continue; // every current member has one; skip malformed entries defensively

    legislators.push({
      id: bioguideId,
      bioguideId,
      govtrackId: person.id?.govtrack ?? null,
      firstName: person.name?.first ?? null,
      lastName: person.name?.last ?? null,
      photoUrl: photoUrl(bioguideId),
      birthday: person.bio?.birthday ?? null,
    });

    (person.terms ?? []).forEach((term, index) => {
      terms.push({
        id: `${bioguideId}-${index}`,
        legislatorId: bioguideId,
        chamber: chamberFor(term.type),
        stateId: term.state,
        district: term.type === "rep" ? (term.district ?? 0) : null,
        party: term.party ?? null,
        startDate: term.start,
        endDate: term.end,
        isCurrent: term.start <= today && today <= term.end,
      });
    });
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    outFile,
    JSON.stringify(
      {
        source: SOURCE_URL,
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
