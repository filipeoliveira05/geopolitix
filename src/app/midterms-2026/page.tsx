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
          <div className="mt-2 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <tbody>
                {byOffice[office].map((race) => (
                  <tr
                    key={race.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="py-2 pr-3 align-middle whitespace-nowrap">
                      <Link href={`/state/${race.stateId}`} className="hover:underline">
                        {getStateName(race.stateId) ?? race.stateId}
                      </Link>
                    </td>
                    <td className="w-full py-2 pr-3 align-middle">
                      {isPrimaryPending(race) ? (
                        <span className="text-zinc-500 dark:text-zinc-400">
                          Primary not yet held.
                        </span>
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
                    <td className="py-2 align-middle whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {race.status !== "called" && (
                          <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                        )}
                        {race.status === "called" ? "Called" : "Not yet decided"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
