import Link from "next/link";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getAllRaces, isPrimaryPending, type Race, type RaceOffice } from "@/lib/races-data";
import { PartyBadge } from "@/components/PartyBadge";

export const metadata: Metadata = { title: "2026 Midterms — Geopolitix" };
// No dynamic route params here (unlike /state/[abbr]), so Next would
// otherwise prerender this once at build time and serve stale race data
// on every request — force it to read fresh from Supabase each time,
// consistent with the rest of the app never reading from a build-time
// snapshot.
export const dynamic = "force-dynamic";

const OFFICE_LABELS: Record<RaceOffice, string> = {
  senate: "U.S. Senate",
  governor: "Governor",
  house: "U.S. House",
};

// Every Senate/Governor race in this cycle is decided the same day, so a "called" count is
// stuck at 0 for months beforehand — not useful until results actually start coming in. Until
// then, the card shows the days-until-election and how many races' primaries have resolved
// instead; it switches to the called count on its own once the date passes, no code change
// needed when that day comes.
const ELECTION_DATE = new Date(Date.UTC(2026, 10, 3));

// Kept outside the component: reading the wall clock is inherently impure, but this page is
// already `force-dynamic` and meant to reflect real time on every request — isolating it in a
// plain function (rather than calling Date.now() directly in the component body) is what
// satisfies the react-hooks/purity lint rule for that intentional case.
function getElectionCountdown() {
  const now = Date.now();
  return {
    hasPassed: now >= ELECTION_DATE.getTime(),
    daysUntil: Math.ceil((ELECTION_DATE.getTime() - now) / 86_400_000),
  };
}

/** Called/primaries-held counts for a set of races — shared by the Scoreboard cards and each House state's collapsed summary line. */
function raceStats(races: Race[]) {
  return {
    called: races.filter((r) => r.status === "called").length,
    primariesHeld: races.filter((r) => !isPrimaryPending(r)).length,
    total: races.length,
  };
}

function Scoreboard({ races }: { races: Race[] }) {
  const offices: RaceOffice[] = ["senate", "governor", "house"];
  const { hasPassed: electionHasPassed, daysUntil: daysUntilElection } = getElectionCountdown();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {offices.map((office) => {
        const { called, primariesHeld, total } = raceStats(races.filter((r) => r.office === office));
        return (
          <div
            key={office}
            className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
              {OFFICE_LABELS[office]}
            </h2>
            {electionHasPassed ? (
              <p className="mt-1 text-2xl font-semibold">
                {called}
                <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                  {" "}
                  / {total} called
                </span>
              </p>
            ) : (
              <>
                <p className="mt-1 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
                  Election in {daysUntilElection} day{daysUntilElection === 1 ? "" : "s"}{" "}
                  <span className="ml-0.5 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500 align-middle" />
                </p>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                  {primariesHeld} / {total} primaries held
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** One race's row — state/district label + status dot + candidate faceoff. Shared by the Senate/Governor tables and each House state's expanded district table. */
function RaceRow({ race, label }: { race: Race; label: React.ReactNode }) {
  return (
    <tr className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <td className="w-px py-2 pr-1.5 align-middle">
        {race.status !== "called" && (
          <span
            className="block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500"
            title="Not yet decided"
          />
        )}
      </td>
      <td className="py-2 pr-3 align-middle whitespace-nowrap">{label}</td>
      <td className="w-full py-2 pr-3 align-middle">
        {isPrimaryPending(race) ? (
          <span className="text-zinc-500 dark:text-zinc-400">Primary not yet held.</span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {race.candidates.map((candidate) => (
              <span key={candidate.id} className="whitespace-nowrap">
                {candidate.name} <PartyBadge party={candidate.party} />
              </span>
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

/** One state's House races, collapsed by default — native <details>/<summary> disclosure needs no client-side state at all. */
function HouseStateGroup({ stateId, races }: { stateId: string; races: Race[] }) {
  const { hasPassed: electionHasPassed } = getElectionCountdown();
  const { called, primariesHeld, total } = raceStats(races);
  const summaryText = electionHasPassed
    ? `${called}/${total} called`
    : `${primariesHeld}/${total} primaries held`;
  const sortedRaces = [...races].sort((a, b) => (a.districtNumber ?? 0) - (b.districtNumber ?? 0));

  return (
    <details className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
      <summary className="flex cursor-pointer items-center justify-between py-2 text-sm">
        <span>{getStateName(stateId) ?? stateId}</span>
        <span className="text-zinc-500 dark:text-zinc-400">{summaryText}</span>
      </summary>
      <div className="overflow-x-auto overflow-y-hidden pb-2">
        <table className="w-full min-w-[28rem] border-collapse text-sm">
          <tbody>
            {sortedRaces.map((race) => (
              <RaceRow
                key={race.id}
                race={race}
                label={race.districtNumber === 0 ? "At-large" : `District ${race.districtNumber}`}
              />
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export default async function Midterms2026Page() {
  const races = await getAllRaces();
  const byOffice: Record<"senate" | "governor", Race[]> = {
    senate: races
      .filter((r) => r.office === "senate")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
    governor: races
      .filter((r) => r.office === "governor")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
  };

  const houseByState = Object.entries(
    races
      .filter((r) => r.office === "house")
      .reduce<Record<string, Race[]>>((acc, race) => {
        (acc[race.stateId] ??= []).push(race);
        return acc;
      }, {}),
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to map
      </Link>

      <h1 className="mt-2 text-3xl font-semibold">2026 Midterms</h1>
      <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
        This is not a real-time results service: race status updates on a periodic sync, not
        live on election night.
      </p>

      <div className="mt-6">
        <Scoreboard races={races} />
      </div>

      {(["senate", "governor"] as const).map((office) => (
        <div key={office} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {OFFICE_LABELS[office]} races
          </h2>
          <div className="mt-2 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <tbody>
                {byOffice[office].map((race) => (
                  <RaceRow
                    key={race.id}
                    race={race}
                    label={
                      <Link href={`/state/${race.stateId}`} className="hover:underline">
                        {getStateName(race.stateId) ?? race.stateId}
                      </Link>
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          U.S. House races
        </h2>
        <div className="mt-2">
          {houseByState.map(([stateId, stateRaces]) => (
            <HouseStateGroup key={stateId} stateId={stateId} races={stateRaces} />
          ))}
        </div>
      </div>
    </div>
  );
}
