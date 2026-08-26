import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMockStateSummary } from "@/lib/mock-states";
import {
  getCurrentSenators,
  getCurrentRepresentatives,
  legislatorFullName,
} from "@/lib/legislators-data";
import { getGovernor, governorFullName } from "@/lib/governors-data";
import { PartyBadge } from "@/components/PartyBadge";
import { RepresentativesList } from "@/components/RepresentativesList";

type StatePanelProps = {
  abbr: string | null;
  /** District clicked on the map's districts layer, if any — highlights the matching row below. */
  selectedDistrict?: number | null;
};

export function StatePanel({ abbr, selectedDistrict = null }: StatePanelProps) {
  const { data: governor } = useQuery({
    queryKey: ["governor", abbr],
    queryFn: () => getGovernor(abbr as string),
    enabled: abbr !== null,
  });
  const { data: senators } = useQuery({
    queryKey: ["senators", abbr],
    queryFn: () => getCurrentSenators(abbr as string),
    enabled: abbr !== null,
  });
  const { data: representatives } = useQuery({
    queryKey: ["representatives", abbr],
    queryFn: () => getCurrentRepresentatives(abbr as string),
    enabled: abbr !== null,
  });

  if (!abbr) {
    return (
      <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
        Click a state on the map to see its current representation.
      </div>
    );
  }

  const summary = getMockStateSummary(abbr);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">{abbr}</h2>
        {summary && (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Capital: {summary.capital} · Population:{" "}
            {summary.population.toLocaleString()}
          </p>
        )}
        <Link
          href={`/state/${abbr}`}
          className="mt-1 inline-block text-sm text-blue-600 hover:underline dark:text-blue-400"
        >
          View full state page →
        </Link>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Governor
        </h3>
        {governor === undefined ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : governor ? (
          <p className="mt-1">
            <Link href={`/governor/${governor.id}`} className="hover:underline">
              {governorFullName(governor)}
            </Link>{" "}
            <PartyBadge party={governor.party} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">No governor data.</p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Senators
        </h3>
        {senators === undefined ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : senators.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1">
            {senators.map(({ legislator, term }) => (
              <li key={legislator.id}>
                <Link href={`/legislator/${legislator.id}`} className="hover:underline">
                  {legislatorFullName(legislator)}
                </Link>{" "}
                <PartyBadge party={term.party} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No senators (territory or non-voting delegate only).
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          House representatives
        </h3>
        {representatives === undefined ? (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>
        ) : representatives.length > 0 ? (
          <RepresentativesList
            representatives={representatives}
            selectedDistrict={selectedDistrict}
          />
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No representative data.
          </p>
        )}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Senators/representatives/governor synced from real sources. Capital/population are
        mock data — Phase 2 geography sync not built yet.
      </p>
    </div>
  );
}
