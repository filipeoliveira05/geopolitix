import Link from "next/link";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import {
  getSenateAndGovernorRaces,
  getHouseRaceCountsByState,
  isPrimaryPending,
  type Race,
  type RaceOffice,
} from "@/lib/races-data";
import { RaceRow } from "@/components/RaceRow";
import { HouseRacesByState } from "@/components/HouseRacesByState";

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

function ScoreboardCard({
  label,
  total,
  called,
  primariesHeld,
  electionHasPassed,
  daysUntilElection,
}: {
  label: string;
  total: number;
  called: number;
  // null when this card's data source doesn't have per-candidate detail to
  // compute a primaries-held count from (the House card — see page-level
  // comment on why its count is cheap/status-only).
  primariesHeld: number | null;
  electionHasPassed: boolean;
  daysUntilElection: number;
}) {
  return (
    <div className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
      <h2 className="text-sm font-bold uppercase tracking-wide text-zinc-800 dark:text-zinc-100">
        {label}
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
            {primariesHeld === null ? `${total} races` : `${primariesHeld} / ${total} primaries held`}
          </p>
        </>
      )}
    </div>
  );
}

export default async function Midterms2026Page() {
  const senateAndGovernorRaces = await getSenateAndGovernorRaces();
  const houseCounts = await getHouseRaceCountsByState();

  const { hasPassed: electionHasPassed, daysUntil: daysUntilElection } = getElectionCountdown();

  const byOffice: Record<"senate" | "governor", Race[]> = {
    senate: senateAndGovernorRaces
      .filter((r) => r.office === "senate")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
    governor: senateAndGovernorRaces
      .filter((r) => r.office === "governor")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
  };

  const houseTotal = houseCounts.reduce((sum, s) => sum + s.total, 0);
  const houseCalled = houseCounts.reduce((sum, s) => sum + s.called, 0);

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

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(["senate", "governor"] as const).map((office) => {
          const officeRaces = byOffice[office];
          return (
            <ScoreboardCard
              key={office}
              label={OFFICE_LABELS[office]}
              total={officeRaces.length}
              called={officeRaces.filter((r) => r.status === "called").length}
              primariesHeld={officeRaces.filter((r) => !isPrimaryPending(r)).length}
              electionHasPassed={electionHasPassed}
              daysUntilElection={daysUntilElection}
            />
          );
        })}
        <ScoreboardCard
          label={OFFICE_LABELS.house}
          total={houseTotal}
          called={houseCalled}
          primariesHeld={null}
          electionHasPassed={electionHasPassed}
          daysUntilElection={daysUntilElection}
        />
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
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Expand a state to load its districts.
        </p>
        <div className="mt-2">
          <HouseRacesByState summaries={houseCounts} electionHasPassed={electionHasPassed} />
        </div>
      </div>
    </div>
  );
}
