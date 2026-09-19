import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  citySlug,
  getCityBySlug,
  getCollegeBasketballForState,
  getCollegeFootballForState,
  getSportsTeamsForState,
  teamCitySlug,
  teamCitySubPlace,
  type City,
  type CollegeProgram,
} from "@/lib/geography-data";
import { getStateName } from "@/lib/states";
import { getJobFreshness } from "@/lib/sync-freshness";
import { formatPopulation } from "@/lib/format";
import { BackToMapLink } from "@/components/BackToMapLink";
import { SectionHeading } from "@/components/SectionHeading";
import { SyncFreshnessNote } from "@/components/SyncFreshnessNote";

// One page per synced city — i.e. exactly the `cities` table's contents (each state's top 10 most
// populous + its capital, ~510 rows), nothing more. A pro team or college program whose home city
// isn't one of those (Foxborough MA, East Rutherford NJ, Inglewood CA) deliberately gets no page;
// its city keeps rendering as plain text wherever it appears, rather than as a link to a 404.
//
// No `force-dynamic` needed here, unlike /midterms-2026 and /quiz/history (see CLAUDE.md): this
// route has dynamic params and no generateStaticParams, so Next renders it on demand already.

type CityPageParams = { state: string; slug: string };

// A state abbreviation is stored uppercase in Supabase but a URL is routinely typed/shared
// lowercase, so normalize before the `.eq("state_id", ...)` lookup rather than 404-ing on
// /city/tx/houston.
async function resolve({ state, slug }: CityPageParams): Promise<{
  abbr: string;
  stateName: string;
  city: City;
} | null> {
  const abbr = state.toUpperCase();
  const stateName = getStateName(abbr);
  if (!stateName) return null;
  const city = await getCityBySlug(abbr, slug);
  return city ? { abbr, stateName, city } : null;
}

export async function generateMetadata(
  props: PageProps<"/city/[state]/[slug]">,
): Promise<Metadata> {
  const resolved = await resolve(await props.params);
  return {
    title: resolved
      ? `${resolved.city.name}, ${resolved.stateName} — Geopolitix`
      : "Geopolitix",
  };
}

const LEAGUE_ORDER = ["NFL", "NBA", "MLB", "NHL", "MLS", "WNBA", "NWSL"];

export default async function CityPage(props: PageProps<"/city/[state]/[slug]">) {
  const resolved = await resolve(await props.params);
  if (!resolved) notFound();
  const { abbr, stateName, city } = resolved;

  // Teams are matched to their city by name, not by a FK — the sports_teams -> cities FK was
  // dropped in the 2026-09-01 WPR revamp and each row now stores its own city_name text. Both
  // sides normalize through citySlug(), so case, punctuation and the St./Saint spelling split all
  // disappear; teamCitySlug() additionally folds in the borough/Chicago-side aliases
  // (city-aliases.ts), with the real sub-place still shown per row via teamCitySubPlace().
  const [sportsTeams, collegeFootball, collegeBasketball] = await Promise.all([
    getSportsTeamsForState(abbr),
    getCollegeFootballForState(abbr),
    getCollegeBasketballForState(abbr),
  ]);
  const inThisCity = <T extends { cityName: string }>(rows: T[]) =>
    rows.filter((row) => teamCitySlug(abbr, row.cityName) === citySlug(city.name));
  const cityTeams = inThisCity(sportsTeams);
  const cityFootball = inThisCity(collegeFootball);
  const cityBasketball = inThisCity(collegeBasketball);
  const hasSports = cityTeams.length + cityFootball.length + cityBasketball.length > 0;

  const geographySyncedAt = await getJobFreshness(["geography"]);

  const proLeagueGroups = LEAGUE_ORDER.map((league) => ({
    league,
    teams: cityTeams.filter((team) => team.league === league),
  })).filter((group) => group.teams.length > 0);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      {/* No state flag here, on a capital or otherwise — it's the state's emblem, not the city's,
          and it belongs on /state/[abbr]'s own Overview where it already lives. The `Capital`
          badge alone marks a seat of state government. */}
      <div className="mt-2">
        <h1 className="font-display text-3xl font-semibold text-ink">
          {city.name}
          {city.isCapital && (
            <span className="ml-2 inline-block rounded bg-seal-soft px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-seal">
              Capital
            </span>
          )}
        </h1>
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {/* The state lives here as a stat cell rather than as a subtitle under the <h1>: this is
            the page's only route back to /state/[abbr], so it sits in the stat row where the
            state page's own Geography tab puts Capital/Population/Region, instead of being
            repeated in both places. */}
        <Section title="Overview">
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Population
              </div>
              <div className="font-display text-lg">
                {city.population ? formatPopulation(city.population) : "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
                State
              </div>
              <div className="font-display text-lg">
                <Link href={`/state/${abbr}`} className="link-accent">
                  {stateName}
                </Link>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Sports teams">
          {hasSports ? (
            <div className="flex flex-col gap-4">
              {proLeagueGroups.map((group) => (
                <TeamGroup key={group.league} title={group.league}>
                  {group.teams.map((team) => (
                    <TeamRow
                      key={team.id}
                      href={`/team/${team.id}`}
                      logoUrl={team.logoUrl}
                      name={team.name}
                      subPlace={teamCitySubPlace(abbr, team.cityName)}
                    />
                  ))}
                </TeamGroup>
              ))}
              <ProgramGroup
                title="NCAA Football (FBS)"
                programs={cityFootball}
                hrefBase="/college-football"
                abbr={abbr}
              />
              <ProgramGroup
                title="NCAA Basketball (D1)"
                programs={cityBasketball}
                hrefBase="/college-basketball"
                abbr={abbr}
              />
            </div>
          ) : (
            <p className="text-sm text-muted">No sports teams based in {city.name}.</p>
          )}
        </Section>
      </div>

      <footer className="mt-6 py-6 text-center">
        {/* One possessive per-entity line, exactly like TeamProfile's — this is an individual
            entity page, so it follows the per-row convention (CLAUDE.md's "per-row on individual
            entity pages") rather than the per-job row the /state/[abbr] hub uses. The figure is
            the geography sync's, which is what produced this city's own name/population/capital;
            each team listed below carries its own freshness on its own page. */}
        <SyncFreshnessNote label="This city" syncedAt={geographySyncedAt} possessive />
      </footer>
    </div>
  );
}

// Same shape as StateTabs' own Section, kept local rather than shared: that one lives inside a
// "use client" file, and this page is a pure server component with no other reason to pull a
// client boundary in.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-rule pb-1">
        <SectionHeading as="h3">{title}</SectionHeading>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// A flat labelled group rather than the state page's CollapsibleGroup — a state hosts dozens of
// teams across seven leagues and genuinely needs collapsing, while a single city hosts a handful,
// so collapsing here would just hide every row behind a click for no gain.
function TeamGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">{title}</div>
      {/* overflow-x-auto (+ overflow-y-hidden to avoid the unset-y-becomes-auto trap, per
          CLAUDE.md's horizontally-scrolling-content convention) so a long name/conference combo
          scrolls within its own row instead of wrapping. */}
      <div className="mt-1 overflow-x-auto overflow-y-hidden">
        <ul className="flex flex-col gap-2">{children}</ul>
      </div>
    </div>
  );
}

function TeamRow({
  href,
  logoUrl,
  name,
  nickname,
  conference,
  subPlace,
}: {
  href: string;
  logoUrl: string | null;
  name: string;
  nickname?: string | null;
  conference?: string | null;
  // The borough / city side this team actually plays in, when it reached this page through an
  // alias — folding the Yankees into New York's page shouldn't quietly erase "The Bronx".
  subPlace?: string | null;
}) {
  return (
    <li className="flex items-center gap-2 whitespace-nowrap">
      {/* Fixed-width slot even with no logo (a real, expected gap for some smaller schools) so
          rows stay aligned — same reasoning as StateTabs' own team/program lists. */}
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">
        {logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- external Wikimedia URL, same convention as photo_url elsewhere
          <img src={logoUrl} alt="" className="max-h-5 max-w-5 object-contain" />
        )}
      </span>
      <Link href={href} className="link-accent">
        {name}
        {nickname && (
          <>
            {" "}
            <strong className="font-semibold">{nickname}</strong>
          </>
        )}
      </Link>
      {conference && (
        <span className="rounded bg-seal-soft px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-seal">
          {conference}
        </span>
      )}
      {subPlace && <span className="text-muted">({subPlace})</span>}
    </li>
  );
}

function ProgramGroup({
  title,
  programs,
  hrefBase,
  abbr,
}: {
  title: string;
  programs: CollegeProgram[];
  hrefBase: "/college-football" | "/college-basketball";
  abbr: string;
}) {
  if (programs.length === 0) return null;
  return (
    <TeamGroup title={title}>
      {programs.map((program) => (
        <TeamRow
          key={program.id}
          href={`${hrefBase}/${program.id}`}
          logoUrl={program.logoUrl}
          name={program.school}
          nickname={program.nickname}
          conference={program.conference}
          subPlace={teamCitySubPlace(abbr, program.cityName)}
        />
      ))}
    </TeamGroup>
  );
}
