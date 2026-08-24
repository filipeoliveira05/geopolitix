import { getMockStateSummary } from "@/lib/mock-states";
import {
  getCurrentSenators,
  getCurrentRepresentatives,
  legislatorFullName,
} from "@/lib/legislators-data";

export function StatePanel({ abbr }: { abbr: string | null }) {
  if (!abbr) {
    return (
      <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
        Click a state on the map to see its current representation.
      </div>
    );
  }

  const summary = getMockStateSummary(abbr);
  const senators = getCurrentSenators(abbr);
  const representatives = getCurrentRepresentatives(abbr);

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
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Governor
        </h3>
        {summary ? (
          <p className="mt-1">
            {summary.governor.name}{" "}
            <span className="text-zinc-500 dark:text-zinc-400">
              ({summary.governor.party})
            </span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No governor data yet — only CA, TX, NY, FL are populated in this
            dev slice.
          </p>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Senators
        </h3>
        {senators.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1">
            {senators.map(({ legislator, term }) => (
              <li key={legislator.id}>
                {legislatorFullName(legislator)}{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  ({term.party})
                </span>
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
        {representatives.length > 0 ? (
          <ul className="mt-1 flex max-h-64 flex-col gap-1 overflow-y-auto">
            {representatives.map(({ legislator, term }) => (
              <li key={legislator.id}>
                {term.district === 0 ? "At-large" : `District ${term.district}`}
                : {legislatorFullName(legislator)}{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  ({term.party})
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No representative data.
          </p>
        )}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Senators/representatives synced from unitedstates/congress-legislators.
        Governor and geography are mock data — not yet synced from Supabase.
      </p>
    </div>
  );
}
