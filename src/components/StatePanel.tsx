import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { getMockStateSummary } from "@/lib/mock-states";
import {
  getCurrentSenators,
  getCurrentRepresentatives,
  legislatorFullName,
} from "@/lib/legislators-data";
import { getGovernor, governorFullName } from "@/lib/governors-data";
import { getStateName } from "@/lib/states";
import { PartyBadge } from "@/components/PartyBadge";
import { RepresentativesList } from "@/components/RepresentativesList";

type StatePanelProps = {
  abbr: string | null;
  /** District clicked on the map's districts layer, if any — highlights the matching row below. */
  selectedDistrict?: number | null;
  /** Clears the selection, e.g. via a close button — omitted when the panel has nothing to close. */
  onClose?: () => void;
};

export function StatePanel({ abbr, selectedDistrict = null, onClose }: StatePanelProps) {
  const {
    data: governor,
    isError: governorError,
    refetch: refetchGovernor,
  } = useQuery({
    queryKey: ["governor", abbr],
    queryFn: () => getGovernor(abbr as string),
    enabled: abbr !== null,
  });
  const {
    data: senators,
    isError: senatorsError,
    refetch: refetchSenators,
  } = useQuery({
    queryKey: ["senators", abbr],
    queryFn: () => getCurrentSenators(abbr as string),
    enabled: abbr !== null,
  });
  const {
    data: representatives,
    isError: representativesError,
    refetch: refetchRepresentatives,
  } = useQuery({
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
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-xl font-semibold">
            {getStateName(abbr) ?? abbr} <span className="text-zinc-400 dark:text-zinc-500">({abbr})</span>
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
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
        {governorError ? (
          <FetchError onRetry={() => refetchGovernor()} />
        ) : governor === undefined ? (
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
        {senatorsError ? (
          <FetchError onRetry={() => refetchSenators()} />
        ) : senators === undefined ? (
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
        {representativesError ? (
          <FetchError onRetry={() => refetchRepresentatives()} />
        ) : representatives === undefined ? (
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

function FetchError({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="mt-1 text-sm text-red-600 dark:text-red-400">
      Couldn&apos;t load this.{" "}
      <button onClick={onRetry} className="underline hover:no-underline">
        Retry
      </button>
    </p>
  );
}
