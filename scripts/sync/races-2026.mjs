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
import { fetchWikipediaSummary, mapWithConcurrency, withHardTimeout } from "./_wikipedia.mjs";

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

/** Reverse of buildStateNameToAbbr() — needed to give the Wikipedia search
 * query a full state name ("California") as disambiguating context,
 * since candidates.state_id only stores the abbreviation. */
function invertMap(map) {
  return new Map([...map].map(([key, value]) => [value, key]));
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

// A candidate search query ("<name> <state> 2026 candidate") very often
// ranks the RACE's own Wikipedia article above the person's own biography
// — that race article naturally mentions the candidate's name prominently
// too. Confirmed live at real scale, not a rare edge case: 419/567
// candidates (74%) landed on an election/race overview page instead of a
// person page before this filter existed (e.g. Ken Paxton's search top
// hit was "2026 United States Senate election in Texas", whose thumbnail
// is the Seal of Texas, not a photo of him).
const ELECTION_PAGE_TITLE_PATTERN = /\belections?\b|\bcongressional district\b/i;

/**
 * Even after excluding election pages, MediaWiki's full-text search can
 * still rank a completely unrelated article above anything to do with the
 * candidate — confirmed live at real scale: auditing the first backfill
 * pass found 243/455 "successful" matches (53%) had zero connection to the
 * candidate's actual name (e.g. "Joseph Chou" -> "Deaths in 2026", "Sam
 * Gallucci" -> "Eagles (band)", "Aaron Gies" -> "Anne Frank"). Two
 * successive attempts at a looser heuristic (surname-only, then
 * surname + first-initial) each fixed the failures found so far but kept
 * turning up new ones on the next audit — "Tommy Hanson"/"Tommy Vietor" on
 * shared first name alone, then "Peter Crosby"/"Sidney Crosby" and "Carlos
 * De La Cruz"/"Monica De La Cruz" on shared surname alone. Requiring an
 * EXACT name match (case/punctuation/a trailing disambiguator like
 * "(politician)" aside) instead of chasing further heuristics accepts a
 * real cost — legitimate nickname variants like "Dave Dawson" matching
 * "David Dawson" no longer auto-resolve — in exchange for eliminating
 * this whole class of wrong-person mismatch outright. Candidates left
 * unresolved this way are exactly the ones worth a human glance rather
 * than another automated guess.
 */
function normalizeExactName(str) {
  return str
    .toLowerCase()
    .replace(/\s*\([^)]*\)\s*$/, "") // strip a trailing disambiguator, e.g. "(politician)"
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleMatchesCandidateName(candidateName, title) {
  if (ELECTION_PAGE_TITLE_PATTERN.test(title)) return false;
  return normalizeExactName(candidateName) === normalizeExactName(title);
}

async function searchWikipediaTitle(query, candidateName) {
  const url = `${API_BASE}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json`;
  const data = await fetchJson(url);
  const hits = data.query?.search ?? [];
  const personHit = hits.find((hit) => titleMatchesCandidateName(candidateName, hit.title));
  return personHit?.title ?? null;
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

// Loaded once per run, not per candidate — current legislators (via their
// current term) and every governor, grouped by state, so matching a
// candidate's scraped name is a plain in-memory lookup. Deliberately only
// CURRENT officeholders (not historical `terms`/`governor_terms` rows) —
// see the design spec's "Explicitly out of scope" section for why: a
// former officeholder now running again falls through to the
// Wikipedia-search path like any other candidate, a reasonable
// simplification given the much larger historical population would
// meaningfully increase false-positive match risk for a plain
// name/surname comparison.
async function loadCurrentOfficeholders(supabase) {
  const { data: termRows, error: termError } = await supabase
    .from("terms")
    .select("legislator_id, state_id, legislators(first_name, last_name)")
    .eq("is_current", true);
  if (termError) throw termError;

  const { data: governorRows, error: governorError } = await supabase
    .from("governors")
    .select("id, first_name, last_name, state_id");
  if (governorError) throw governorError;

  const byState = new Map();
  function addEntry(stateId, entry) {
    const list = byState.get(stateId) ?? [];
    list.push(entry);
    byState.set(stateId, list);
  }

  for (const row of termRows) {
    const person = row.legislators;
    if (!person) continue;
    addEntry(row.state_id, {
      type: "legislator",
      id: row.legislator_id,
      fullName: normalizeExactName(`${person.first_name ?? ""} ${person.last_name ?? ""}`),
    });
  }
  for (const gov of governorRows) {
    addEntry(gov.state_id, {
      type: "governor",
      id: gov.id,
      fullName: normalizeExactName(`${gov.first_name ?? ""} ${gov.last_name ?? ""}`),
    });
  }
  return byState;
}

/**
 * Exact full-name match first; falls back to a surname-suffix match (same
 * style as governor-history.mjs's namesMatch) only when it resolves to
 * exactly one person — an ambiguous surname match (two current
 * officeholders sharing a surname in the same state) is left unmatched
 * rather than guessed, same "don't guess when ambiguous" discipline as
 * governor-history.mjs's resolveParty().
 */
/**
 * Exact full-name match only — no surname fallback. An earlier version
 * fell back to a surname-suffix match when it resolved to exactly one
 * officeholder in the state, which sounded safe but wasn't: confirmed live
 * that it linked candidates straight to a completely unrelated
 * same-surname officeholder ("Jennifer Davis" -> Rep. Danny Davis,
 * "Trever Nehls" -> Rep. Troy Nehls, five more besides — all caught by the
 * user manually reviewing candidate pages, not by any automated check).
 * This is the same class of bug the Wikipedia bio-matching heuristic had
 * (see `titleMatchesCandidateName`) and gets the same fix: exact match
 * only, unmatched candidates fall through to their own `/candidate/[id]`
 * page instead of a guessed link.
 */
function matchOfficeholder(candidateName, stateId, officeholdersByState) {
  const officials = officeholdersByState.get(stateId);
  if (!officials || officials.length === 0) return null;
  const nameNormalized = normalizeExactName(candidateName);
  return officials.find((o) => o.fullName === nameNormalized) ?? null;
}

/** "John Q. Smith" + "CA" -> "ca-john-q-smith". See the design spec's normalization rule. */
function candidateSlug(stateId, name) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${stateId.toLowerCase()}-${normalized}`;
}

/** Same placeholder detection as races-data.ts's isPrimaryPending() — never worth
 * matching or creating a candidates row for a "TBD"/"(presumptive)" placeholder. */
function isPlaceholderCandidateName(name) {
  return name.trim().toUpperCase() === "TBD" || /\(presumptive\)/i.test(name);
}

/**
 * RACES_SCOPE=pending support — the vast majority of 2026 primaries are
 * already resolved and locked in for the general, so re-fetching every
 * state's Wikipedia page every week is mostly re-confirming "still the same
 * answer." Rather than a hand-maintained primary-date calendar (which would
 * go stale the moment a date changes), pending-ness is derived from our OWN
 * already-synced data: a state/office is "pending" if it has a placeholder
 * candidate, no candidates at all, or no synced race yet. Once a state's
 * real primary result lands here, the very next run stops re-fetching it.
 */
async function getPendingStateSets(supabase) {
  // races_2026 has two FKs touching race_candidates (race_id, and the
  // reverse via winner_candidate_id) — same disambiguation
  // races-data.ts's RACE_WITH_CANDIDATES_SELECT and candidates-data.ts's
  // embed both already needed.
  const { data: raceRows, error } = await supabase
    .from("races_2026")
    .select("office, state_id, race_candidates!race_candidates_race_id_fkey(name)");
  if (error) throw error;

  const seenByOffice = { senate: new Set(), governor: new Set(), house: new Set() };
  const pendingByOffice = { senate: new Set(), governor: new Set(), house: new Set() };

  for (const row of raceRows) {
    seenByOffice[row.office].add(row.state_id);
    const names = row.race_candidates.map((c) => c.name);
    const isPending = names.length === 0 || names.some(isPlaceholderCandidateName);
    if (isPending) pendingByOffice[row.office].add(row.state_id);
  }

  return { seenByOffice, pendingByOffice };
}

/** A state/office never synced before is treated as pending too — first-ever
 * sync, or a race that's newly appeared in the Wikipedia category. */
function isStatePending(office, stateAbbr, { seenByOffice, pendingByOffice }) {
  if (!seenByOffice[office].has(stateAbbr)) return true;
  return pendingByOffice[office].has(stateAbbr);
}

function normalizeParty(rawParty) {
  const cleaned = cleanWikiText(rawParty);
  if (!cleaned) return null;
  if (/democrat/i.test(cleaned)) return "Democrat";
  if (/republican/i.test(cleaned)) return "Republican";
  if (/independent/i.test(cleaned)) return "Independent";
  return cleaned;
}

// A replacement nominee's infobox entry is conventionally annotated
// parenthetically — confirmed live in the raw wikitext: `[[Troy Jackson]]
// <!--comment-->(replacing [[Graham Platner]])<!--comment-->` — which
// cleanWikiText correctly reduces to plain text but has no reason to know
// is anything other than part of the name. Left unstripped, this doesn't
// just look wrong when displayed — it broke Wikipedia-search name matching
// downstream too (backfillCandidateBios saw "Graham Platner" as this
// candidate's own surname and confidently attached Platner's bio/photo to
// Troy Jackson's page, caught live before this fix).
function stripReplacementAnnotation(name) {
  return name.replace(/\s*\(replacing\s+[^)]*\)\s*$/i, "").trim();
}

function extractCandidates(fields) {
  const candidates = [];
  for (let i = 1; i <= 8; i++) {
    const rawName = fields[`nominee${i}`] ?? fields[`candidate${i}`];
    if (rawName === undefined && fields[`party${i}`] === undefined) continue;
    const name = stripReplacementAnnotation(cleanWikiText(rawName ?? ""));
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

async function collectRaces(office, category, parseStateFromTitle, stateNameToAbbr, pendingInfo) {
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

    if (pendingInfo && !isStatePending(office, stateAbbr, pendingInfo)) {
      console.log(`[${office} ${i + 1}/${titles.length}] ${stateAbbr}: already resolved, skipping`);
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

async function collectHouseRaces(stateNameToAbbr, pendingInfo) {
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

    // House is one page per STATE (all its districts) — pending-ness is
    // checked at the state level too, since a single unresolved district
    // means the whole page still needs re-parsing anyway.
    if (pendingInfo && !isStatePending("house", stateAbbr, pendingInfo)) {
      console.log(`[house ${i + 1}/${titles.length}] ${stateAbbr}: already resolved, skipping`);
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

/**
 * Best-effort bio/photo backfill for candidates with no existing app
 * profile — a name-based Wikipedia search (no reliable ID like bioguide_id
 * or a Wikidata QID exists for a scraped candidate name), taking only the
 * top hit with no further verification. This is an accepted, unconditional
 * risk for every row in this table — see the design spec — not something
 * this function tries to score or verify further. Self-healing via the
 * same bio_summary IS NULL filter as every other backfill in this
 * codebase: a candidate with no search hit, or no summary, is simply
 * retried next run.
 */
async function backfillCandidateBios(supabase, abbrToStateName, warnings, { budgetMs } = {}) {
  const { data: candidates, error } = await supabase
    .from("candidates")
    .select("id, name, state_id")
    .is("bio_summary", null);
  if (error) throw error;
  if (candidates.length === 0) return 0;

  console.log(`Backfilling ${candidates.length} candidate bios...`);
  let updated = 0;
  let processed = 0;
  // Bounds how long this pass keeps picking up new work — the weekly
  // races-sync.yml run sets a modest budget so a normal week never balloons
  // (this backlog took 45+ minutes unbounded on a real run); the dedicated
  // candidate-bio-backfill.yml workflow sets a larger one to drain it
  // faster on its own more-frequent cadence. Same mechanism as
  // legislators.mjs's own BACKFILL_BUDGET_MS.
  const deadline = budgetMs ? Date.now() + budgetMs : undefined;
  const shouldStop = deadline ? () => Date.now() > deadline : undefined;

  await mapWithConcurrency(candidates, 2, async (candidate) => {
    const stateName = abbrToStateName.get(candidate.state_id) ?? candidate.state_id;
    const query = `${candidate.name} ${stateName} 2026 candidate`;

    let title;
    try {
      title = await withHardTimeout(
        () => searchWikipediaTitle(query, candidate.name),
        30_000,
        `candidate search (${candidate.id})`,
      );
    } catch (err) {
      warnings.push(`candidate bio backfill: search failed for ${candidate.name} — ${err.message}`);
      processed++;
      return;
    }
    if (!title) {
      processed++;
      return; // no hit — stays bio_summary null, retried next run
    }

    let bioSummary;
    let photoUrl;
    try {
      ({ bioSummary, photoUrl } = await withHardTimeout(
        (signal) => fetchWikipediaSummary(title, signal),
        90_000,
        `candidate bio (${candidate.id})`,
      ));
    } catch (err) {
      warnings.push(`candidate bio backfill: summary fetch failed for ${candidate.name} — ${err.message}`);
      processed++;
      return;
    }

    const { error: updateError } = await supabase
      .from("candidates")
      .update({ wikipedia_title: title, bio_summary: bioSummary, photo_url: photoUrl })
      .eq("id", candidate.id);
    if (updateError) {
      warnings.push(`candidate bio backfill: update failed for ${candidate.name} — ${updateError.message}`);
      processed++;
      return;
    }
    updated++;
    processed++;
    if (processed % 10 === 0) console.log(`  ${processed}/${candidates.length} processed`);
  }, { shouldStop });

  if (shouldStop?.()) {
    console.log(
      `  time budget reached — ${processed}/${candidates.length} attempted this run, remainder resumes next run.`,
    );
  }

  return updated;
}

// RACES_SCOPE=pending skips re-fetching any state/office already resolved
// (see getPendingStateSets) — the weekly races-sync.yml cadence. Unset
// (default "full") re-fetches everything, for a manual run or the Nov 3
// general-election sweep where every state needs re-checking regardless of
// primary status. CANDIDATES_BACKFILL_ONLY/BACKFILL_BUDGET_MS mirror
// legislators.mjs's own env vars exactly, for the same reason: a dedicated,
// more-frequent workflow (candidate-bio-backfill.yml) can drain the bio
// backlog without re-running the whole race sync every time.
const RACES_SCOPE = process.env.RACES_SCOPE === "pending" ? "pending" : "full";
const CANDIDATES_BACKFILL_ONLY = process.env.CANDIDATES_BACKFILL_ONLY === "true";
const BACKFILL_BUDGET_MS = process.env.BACKFILL_BUDGET_MS
  ? Number(process.env.BACKFILL_BUDGET_MS)
  : undefined;

async function main() {
  const stateNameToAbbr = buildStateNameToAbbr();
  const abbrToStateName = invertMap(stateNameToAbbr);
  const startedAt = new Date().toISOString();
  const supabase = supabaseAdmin();

  if (CANDIDATES_BACKFILL_ONLY) {
    const warnings = [];
    let backfillError = null;
    let bioCount = 0;
    try {
      bioCount = await backfillCandidateBios(supabase, abbrToStateName, warnings, {
        budgetMs: BACKFILL_BUDGET_MS,
      });
    } catch (err) {
      backfillError = err;
    }
    if (warnings.length > 0) {
      console.warn(`${warnings.length} candidate bio backfill warning(s):\n${warnings.join("\n")}`);
    }
    // Separate job slug from "races" — this runs far more often than the
    // weekly race sync (same reasoning legislators_bio_backfill is kept out
    // of the "core jobs" freshness figure in src/lib/sync-freshness.ts, see
    // CLAUDE.md), so it should never claim to speak for race-data freshness.
    await logSync(supabase, {
      source: "candidates (bio backfill only, no race sync)",
      startedAt,
      error: backfillError,
      warnings,
      job: "races_candidate_backfill",
    });
    if (backfillError) throw backfillError;
    console.log(`Backfilled ${bioCount} candidate bio(s) (backfill-only mode).`);
    return;
  }

  const pendingInfo = RACES_SCOPE === "pending" ? await getPendingStateSets(supabase) : null;

  // Sequential, not Promise.all — running both chambers concurrently
  // doubles the effective request rate and triggers Wikipedia's rate
  // limiter faster (hit this in practice).
  const senateRaces = await collectRaces(
    "senate",
    SENATE_CATEGORY,
    parseSenateTitle,
    stateNameToAbbr,
    pendingInfo,
  );
  const governorRaces = await collectRaces(
    "governor",
    GOVERNOR_CATEGORY,
    parseGovernorTitle,
    stateNameToAbbr,
    pendingInfo,
  );
  const houseRaces = await collectHouseRaces(stateNameToAbbr, pendingInfo);
  const races = [...senateRaces, ...governorRaces, ...houseRaces];

  const officeholdersByState = await loadCurrentOfficeholders(supabase);

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
  // Which (office, state) combos actually got a fresh insert this run —
  // scopes the cleanup delete below so a RACES_SCOPE=pending run only ever
  // considers deleting stale rows for states it actually re-checked, never
  // the ones it deliberately skipped (see getPendingStateSets above).
  const touchedByOffice = { senate: new Set(), governor: new Set(), house: new Set() };

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
    touchedByOffice[race.office].add(race.state_id);

    if (race.candidates.length === 0) continue;

    const candidateRowsToInsert = [];
    for (const c of race.candidates) {
      let matchedLegislatorId = null;
      let matchedGovernorId = null;
      let candidateId = null;

      if (!isPlaceholderCandidateName(c.name)) {
        const match = matchOfficeholder(c.name, race.state_id, officeholdersByState);
        if (match?.type === "legislator") {
          matchedLegislatorId = match.id;
        } else if (match?.type === "governor") {
          matchedGovernorId = match.id;
        } else {
          candidateId = candidateSlug(race.state_id, c.name);
          // Only touches name/state_id/last_synced_at — never bio_summary/
          // photo_url/wikipedia_title, so an already-backfilled bio (see
          // backfillCandidateBios below) survives every week's resync
          // instead of being wiped and re-fetched.
          const { error: candidateUpsertError } = await supabase.from("candidates").upsert(
            { id: candidateId, name: c.name, state_id: race.state_id, last_synced_at: new Date().toISOString() },
            { onConflict: "id" },
          );
          if (candidateUpsertError) {
            error = candidateUpsertError;
            break;
          }
        }
      }

      candidateRowsToInsert.push({
        race_id: raceRow.id,
        name: c.name,
        party: c.party,
        is_incumbent: c.is_incumbent,
        candidate_id: candidateId,
        matched_legislator_id: matchedLegislatorId,
        matched_governor_id: matchedGovernorId,
      });
    }
    if (error) break;

    const { data: candidateRows, error: candidatesError } = await supabase
      .from("race_candidates")
      .insert(candidateRowsToInsert)
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
    if (RACES_SCOPE === "pending") {
      // Scoped per office to exactly the states this run touched — a
      // blanket "anything stale" delete would otherwise also remove every
      // state this run deliberately skipped as already-resolved, since
      // none of them got a fresh last_synced_at stamp this run.
      for (const office of ["senate", "governor", "house"]) {
        if (error) break;
        const touchedStates = [...touchedByOffice[office]];
        if (touchedStates.length === 0) continue;
        ({ error } = await supabase
          .from("races_2026")
          .delete()
          .eq("office", office)
          .in("state_id", touchedStates)
          .or(`last_synced_at.lt.${startedAt},last_synced_at.is.null`));
      }
    } else {
      ({ error } = await supabase
        .from("races_2026")
        .delete()
        .or(`last_synced_at.lt.${startedAt},last_synced_at.is.null`));
    }
  } else {
    // Something failed partway through — roll back only the partial rows
    // this run inserted (all stamped >= startedAt), so the previous run's
    // complete data is left exactly as it was rather than mixed with an
    // incomplete new set. The run still reports as failed below.
    await supabase.from("races_2026").delete().gte("last_synced_at", startedAt);
  }

  const warnings = [];
  let bioCount = 0;
  if (!error) {
    try {
      bioCount = await backfillCandidateBios(supabase, abbrToStateName, warnings, {
        budgetMs: BACKFILL_BUDGET_MS,
      });
    } catch (err) {
      error = err;
    }
  }
  if (warnings.length > 0) {
    console.warn(`${warnings.length} candidate bio backfill warning(s):\n${warnings.join("\n")}`);
  }

  await logSync(supabase, {
    source: "Wikipedia MediaWiki API (Infobox election parsing)",
    startedAt,
    error,
    warnings,
    job: "races",
  });

  if (error) throw error;

  const called = races.filter((r) => r.status === "called").length;
  console.log(
    `Synced ${races.length} races (${senateRaces.length} Senate, ${governorRaces.length} Governor, ${houseRaces.length} House), ${called} called, backfilled ${bioCount} candidate bio(s) (scope: ${RACES_SCOPE}).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
