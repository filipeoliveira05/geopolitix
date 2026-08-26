import Link from "next/link";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getAllRaces, type Race, type RaceOffice } from "@/lib/races-data";
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

function Scoreboard({ races }: { races: Race[] }) {
  const offices: RaceOffice[] = ["senate", "governor"];
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
      {offices.map((office) => {
        const officeRaces = races.filter((r) => r.office === office);
        const called = officeRaces.filter((r) => r.status === "called").length;
        return (
          <div
            key={office}
            className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              {OFFICE_LABELS[office]}
            </h2>
            <p className="mt-1 text-2xl font-semibold">
              {called}
              <span className="text-base font-normal text-zinc-500 dark:text-zinc-400">
                {" "}
                / {officeRaces.length} called
              </span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

export default async function Midterms2026Page() {
  const races = await getAllRaces();
  const byOffice: Record<RaceOffice, Race[]> = {
    senate: races
      .filter((r) => r.office === "senate")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
    governor: races
      .filter((r) => r.office === "governor")
      .sort((a, b) => a.stateId.localeCompare(b.stateId)),
    house: [],
  };

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
        Senate and Governor races only — see the House delegation on the map instead. This is
        not a real-time results service: race status updates on a periodic sync, not live on
        election night.
      </p>

      <div className="mt-6">
        <Scoreboard races={races} />
      </div>

      {(["senate", "governor"] as const).map((office) => (
        <div key={office} className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {OFFICE_LABELS[office]} races
          </h2>
          <ul className="mt-2 flex flex-col divide-y divide-zinc-200 dark:divide-zinc-800">
            {byOffice[office].map((race) => (
              <li key={race.id} className="flex items-center justify-between gap-4 py-2">
                <Link href={`/state/${race.stateId}`} className="hover:underline">
                  {getStateName(race.stateId) ?? race.stateId}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  {race.candidates.map((candidate) => (
                    <span key={candidate.id}>
                      {candidate.name} <PartyBadge party={candidate.party} />
                    </span>
                  ))}
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {race.status === "called" ? "Called" : "Not yet decided"}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
