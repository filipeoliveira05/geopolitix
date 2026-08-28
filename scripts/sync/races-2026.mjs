// Populates the Supabase `races_2026`/`race_candidates` tables (plan §4)
// from Wikipedia, for Senate, Governor, and House. Run manually via
// `npm run sync:races`.
//
// House races are structured differently from Senate/Governor: one
// Wikipedia page per STATE (not per race), e.g. "2026 United States House
// of Representatives elections in Texas", with one `==District N==`
// section per district inside it — each still using the same
// `{{Infobox election}}` template and field names as Senate/Governor
// pages (verified live), so all the candidate-parsing helpers below are
// shared across all three offices; only the page-fetching/splitting
// strategy differs (see collectHouseRaces).
//
// No key needed: the public MediaWiki Action API. Race pages are listed via
// two Wikipedia categories, then each page's lead section (section=0,
// where the infobox always lives) is parsed for its `{{Infobox election}}`
// template — not `{{Infobox U.S. Senate election}}` as the plan originally
// guessed; verified live before writing this parser, the same way the
// districts/governors sources were checked rather than assumed.
//
// Confirmed by sampling several real pages before writing this: candidate
// field names vary *within* a chamber, not just across chambers — Senate
// pages use `nominee1`/`nominee2`, but Governors pages use either
// `nominee1`/`nominee2` (Texas) or `candidate1`/`candidate2` (California).
// Party values vary too — some pages use the generic
// "Democratic Party (United States)"/"Republican Party (United States)",
// others use a state-affiliate name ("Republican Party of Texas", "Texas
// Democratic Party") or a wikilinked short form. Normalizing by substring
// match (contains "democrat"/"republican"/"independent") handles all of
// these; exact-string matching would silently miss the state-affiliate
// cases. Third parties are left as-is — same "deliberately neutral, don't
// guess a color" treatment as src/lib/party-colors.ts's FALLBACK_PARTY_STYLE.
//
// As of this writing (Aug 2026, ahead of the Nov 3 election), every race is
// still "open" — `after_election` is empty on every infobox sampled. The
// "called" path (inferred from `after_election` being filled in) is
// implemented but untested against real post-election data; re-verify it
// once a race actually gets called.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { supabaseAdmin, logSync } from "./_supabase-admin.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const API_BASE = "https://en.wikipedia.org/w/api.php";
const USER_AGENT =
  "geopolitix-sync/1.0 (personal educational project; github.com/filipeoliveira05/geopolitix)";

const SENATE_CATEGORY = "Category:2026 United States Senate elections";
const GOVERNOR_CATEGORY = "Category:2026 United States gubernatorial elections";
const HOUSE_CATEGORY = "Category:2026 United States House of Representatives elections";

function buildStateNameToAbbr() {
  // Same source as scripts/sync/states.mjs — us-atlas state names match
  // plain English Wikipedia titles for all 50 states + DC (no territories,
  // which is fine: territories aren't in our `states` table either).
  const fipsToAbbr = JSON.parse(
    readFileSync(path.join(root, "src", "data", "fips-to-abbr.json"), "utf-8"),
  );
  const statesTopology = JSON.parse(
    readFileSync(path.join(root, "node_modules", "us-atlas", "states-10m.json"), "utf-8"),
  );
  const map = new Map();
  for (const geom of statesTopology.objects.states.geometries) {
    const abbr = fipsToAbbr[String(geom.id)];
    if (abbr) map.set(geom.properties.name, abbr);
  }
  return map;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, attempt = 1) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 429 && attempt <= 5) {
    await sleep(5000 * attempt);
    return fetchJson(url, attempt + 1);
  }
  if (!res.ok) throw new Error(`Request failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

async function fetchCategoryMembers(category) {
  const url = `${API_BASE}?action=query&list=categorymembers&cmtitle=${encodeURIComponent(category)}&cmlimit=500&format=json`;
  const data = await fetchJson(url);
  return data.query.categorymembers.map((m) => m.title);
}

async function fetchWikitext(title, { fullPage = false } = {}) {
  // House state pages need the *whole* page — each district's infobox
  // lives under its own `==District N==` section further down, not in the
  // lead section (section=0) where Senate/Governor pages keep theirs.
  const sectionParam = fullPage ? "" : "&section=0";
  const url = `${API_BASE}?action=parse&page=${encodeURIComponent(title)}&prop=wikitext${sectionParam}&format=json`;
  const data = await fetchJson(url);
  return data.parse?.wikitext?.["*"] ?? "";
}

/** Finds `{{Infobox election ... }}`, respecting nested templates (e.g. `{{start date|...}}`). */
function extractInfobox(wikitext) {
  const startIdx = wikitext.indexOf("{{Infobox election");
  if (startIdx === -1) return null;
  let depth = 0;
  let i = startIdx;
  while (i < wikitext.length) {
    if (wikitext.startsWith("{{", i)) {
      depth++;
      i += 2;
    } else if (wikitext.startsWith("}}", i)) {
      depth--;
      i += 2;
      if (depth === 0) return wikitext.slice(startIdx, i);
    } else {
      i++;
    }
  }
  return null;
}

function parseInfoboxFields(block) {
  const fields = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^\s*\|\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m) fields[m[1]] = m[2].trim();
  }
  return fields;
}

/** Strips wiki markup down to plain text: comments, ref tags, non-nested templates, wikilinks. */
function cleanWikiText(value) {
  if (!value) return "";
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "")
    .replace(/<ref[^>]*\/>/g, "")
    .replace(/\{\{[^{}]*\}\}/g, "")
    .replace(/\[\[([^\]|]*)\|([^\]]*)\]\]/g, "$2")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    // Raw HTML tags show up too — e.g. `[[Maura Healey]]<br />''(presumptive)''`
    // on presumptive-nominee pages (caught via a real leaked "<br />" in the
    // rendered UI, not anticipated up front).
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeParty(rawParty) {
  const cleaned = cleanWikiText(rawParty);
  if (!cleaned) return null;
  if (/democrat/i.test(cleaned)) return "Democrat";
  if (/republican/i.test(cleaned)) return "Republican";
  if (/independent/i.test(cleaned)) return "Independent";
  return cleaned;
}

function extractCandidates(fields) {
  const candidates = [];
  for (let i = 1; i <= 8; i++) {
    const rawName = fields[`nominee${i}`] ?? fields[`candidate${i}`];
    if (rawName === undefined && fields[`party${i}`] === undefined) continue;
    const name = cleanWikiText(rawName ?? "");
    if (!name) continue;
    candidates.push({ name, party: normalizeParty(fields[`party${i}`]) });
  }
  const beforeElection = cleanWikiText(fields.before_election);
  return candidates.map((c) => ({ ...c, is_incumbent: beforeElection !== "" && c.name === beforeElection }));
}

function determineStatus(fields, candidates) {
  // Trust `after_election` only if it names one of the actual candidates —
  // pages waiting on a result often fill this with a placeholder ("TBD")
  // rather than leaving it blank, which a "non-empty = called" check would
  // wrongly treat as a real result (caught via a real example, Wisconsin's
  // 2026 governor race, before this guard was added).
  const afterElection = cleanWikiText(fields.after_election);
  const winnerIndex = candidates.findIndex((c) => c.name === afterElection);
  if (winnerIndex === -1) return { status: "open", winnerIndex: null };
  return { status: "called", winnerIndex };
}

async function collectRaces(office, category, parseStateFromTitle, stateNameToAbbr) {
  const titles = await fetchCategoryMembers(category);
  console.log(`${office}: ${titles.length} candidate pages in "${category}"`);
  const races = [];
  for (const [i, title] of titles.entries()) {
    const stateName = parseStateFromTitle(title);
    if (!stateName) continue; // the category's own overview page, not a per-state race
    const stateAbbr = stateNameToAbbr.get(stateName);
    if (!stateAbbr) {
      console.warn(`Skipping "${title}" — no matching state (territory, or name mismatch)`);
      continue;
    }

    const wikitext = await fetchWikitext(title);
    const block = extractInfobox(wikitext);
    if (!block) {
      console.warn(`Skipping "${title}" — no {{Infobox election}} found`);
      await sleep(1000);
      continue;
    }

    const fields = parseInfoboxFields(block);
    const candidates = extractCandidates(fields);
    const { status, winnerIndex } = determineStatus(fields, candidates);
    races.push({ office, state_id: stateAbbr, status, candidates, winnerIndex, title });
    console.log(`[${office} ${i + 1}/${titles.length}] ${stateAbbr}: ${status}`);
    await sleep(1000);
  }
  return races;
}

function parseSenateTitle(title) {
  const m = title.match(/^2026 United States Senate (?:special )?election in (.+)$/);
  return m ? m[1] : null;
}

function parseGovernorTitle(title) {
  const m = title.match(/^2026 (.+) gubernatorial election$/);
  return m ? m[1] : null;
}

function parseHouseTitle(title) {
  // "elections in <State>" (multi-district, e.g. Texas) vs "election in
  // <State>" (single-district/at-large, e.g. Wyoming) — verified live,
  // both forms exist. This same pattern naturally excludes the category's
  // two overview pages ("...House of Representatives elections",
  // "...election ratings") and the 9 standalone special-election pages
  // (e.g. "2026 California's 1st congressional district special
  // election") confirmed live in the category — none of them match "in
  // <State>" with this exact title shape, so no separate exclusion list
  // is needed.
  const m = title.match(/^2026 United States House of Representatives elections? in (.+)$/);
  return m ? m[1] : null;
}

const DISTRICT_HEADING_RE = /^==\s*District\s+(\d+)\s*==\s*$/gm;

/**
 * Splits a House state page into one text block per district, keyed by
 * district number — verified live that every multi-district state's page
 * uses a consistent `==District N==` heading with exactly one
 * `{{Infobox election}}` in each section (sampled Texas's all 38). A page
 * with no such heading at all is a single-district (at-large) state
 * (verified live: Wyoming) — the whole page is that one race, district
 * number 0 to match the `terms`/`legislators` at-large convention used
 * elsewhere in this app.
 */
function splitIntoDistrictSections(wikitext) {
  const matches = [...wikitext.matchAll(DISTRICT_HEADING_RE)];
  if (matches.length === 0) return [{ districtNumber: 0, text: wikitext }];
  return matches.map((match, i) => {
    const start = match.index + match[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : wikitext.length;
    return { districtNumber: Number(match[1]), text: wikitext.slice(start, end) };
  });
}

async function collectHouseRaces(stateNameToAbbr) {
  const titles = await fetchCategoryMembers(HOUSE_CATEGORY);
  console.log(`house: ${titles.length} candidate pages in "${HOUSE_CATEGORY}"`);
  const races = [];
  for (const [i, title] of titles.entries()) {
    const stateName = parseHouseTitle(title);
    if (!stateName) continue; // overview/special-election page, not a per-state page

    const stateAbbr = stateNameToAbbr.get(stateName);
    if (!stateAbbr) {
      console.warn(`Skipping "${title}" — no matching state (territory, or name mismatch)`);
      continue;
    }

    const wikitext = await fetchWikitext(title, { fullPage: true });
    const sections = splitIntoDistrictSections(wikitext);
    let districtCount = 0;
    for (const { districtNumber, text } of sections) {
      const block = extractInfobox(text);
      if (!block) continue; // a non-election section that happens to fall between district headings
      const fields = parseInfoboxFields(block);
      const candidates = extractCandidates(fields);
      const { status, winnerIndex } = determineStatus(fields, candidates);
      races.push({
        office: "house",
        state_id: stateAbbr,
        district_number: districtNumber,
        status,
        candidates,
        winnerIndex,
        title,
      });
      districtCount++;
    }
    console.log(`[house ${i + 1}/${titles.length}] ${stateAbbr}: ${districtCount} district(s)`);
    await sleep(1000);
  }
  return races;
}

async function main() {
  const stateNameToAbbr = buildStateNameToAbbr();
  const startedAt = new Date().toISOString();

  // Sequential, not Promise.all — running both chambers concurrently
  // doubles the effective request rate and triggers Wikipedia's rate
  // limiter faster (hit this in practice).
  const senateRaces = await collectRaces(
    "senate",
    SENATE_CATEGORY,
    parseSenateTitle,
    stateNameToAbbr,
  );
  const governorRaces = await collectRaces(
    "governor",
    GOVERNOR_CATEGORY,
    parseGovernorTitle,
    stateNameToAbbr,
  );
  const houseRaces = await collectHouseRaces(stateNameToAbbr);
  const races = [...senateRaces, ...governorRaces, ...houseRaces];

  const supabase = supabaseAdmin();

  // races_2026.id has no natural key (unlike legislators/governors) to
  // upsert against, so this still fully replaces the table's contents each
  // run — but inserts the fresh set FIRST and only removes old rows after,
  // rather than the reverse. Confirmed live: the original delete-then-insert
  // order left races_2026 (and race_candidates via cascade) genuinely
  // incomplete, not just stale, if any single race's insert failed partway
  // through — everything already deleted, only some of the fresh races
  // re-inserted. Same reorder governors.mjs went through for the same
  // reason. `last_synced_at` (already on every row) is the cutover marker:
  // on success, anything older than `startedAt` is the previous run's data
  // and gets removed; on failure, it's this run's own partial rows (all
  // >= startedAt) that get rolled back instead, leaving the previous
  // run's complete data untouched.
  let error = null;

  for (const race of races) {
    if (error) break;

    const { data: raceRow, error: raceError } = await supabase
      .from("races_2026")
      .insert({
        office: race.office,
        state_id: race.state_id,
        district_id: null,
        district_number: race.district_number ?? null,
        status: race.status,
        last_synced_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (raceError) {
      error = raceError;
      break;
    }

    if (race.candidates.length === 0) continue;

    const { data: candidateRows, error: candidatesError } = await supabase
      .from("race_candidates")
      .insert(
        race.candidates.map((c) => ({
          race_id: raceRow.id,
          name: c.name,
          party: c.party,
          is_incumbent: c.is_incumbent,
        })),
      )
      .select("id");
    if (candidatesError) {
      error = candidatesError;
      break;
    }

    if (race.winnerIndex !== null) {
      ({ error } = await supabase
        .from("races_2026")
        .update({ winner_candidate_id: candidateRows[race.winnerIndex].id })
        .eq("id", raceRow.id));
      if (error) break;
    }
  }

  if (!error) {
    // Every fresh race above succeeded — remove the previous run's rows
    // (race_candidates cascade-deletes via its FK, so clearing races_2026
    // is enough). `.is.null` covers any pre-existing row from before this
    // column existed.
    ({ error } = await supabase
      .from("races_2026")
      .delete()
      .or(`last_synced_at.lt.${startedAt},last_synced_at.is.null`));
  } else {
    // Something failed partway through — roll back only the partial rows
    // this run inserted (all stamped >= startedAt), so the previous run's
    // complete data is left exactly as it was rather than mixed with an
    // incomplete new set. The run still reports as failed below.
    await supabase.from("races_2026").delete().gte("last_synced_at", startedAt);
  }

  await logSync(supabase, {
    source: "Wikipedia MediaWiki API (Infobox election parsing)",
    startedAt,
    error,
  });

  if (error) throw error;

  const called = races.filter((r) => r.status === "called").length;
  console.log(
    `Synced ${races.length} races (${senateRaces.length} Senate, ${governorRaces.length} Governor, ${houseRaces.length} House), ${called} called.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
