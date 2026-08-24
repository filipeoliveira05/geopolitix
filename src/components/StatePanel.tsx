import { getMockStateSummary } from "@/lib/mock-states";

const PARTY_LABEL: Record<string, string> = {
  D: "Democrat",
  R: "Republican",
  I: "Independent",
};

export function StatePanel({ abbr }: { abbr: string | null }) {
  if (!abbr) {
    return (
      <div className="p-6 text-sm text-zinc-500 dark:text-zinc-400">
        Click a state on the map to see its current representation.
      </div>
    );
  }

  const summary = getMockStateSummary(abbr);

  if (!summary) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold">{abbr}</h2>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          No mock data for this state yet. Only CA, TX, NY, FL are populated
          in this dev slice.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h2 className="text-xl font-semibold">{summary.abbr}</h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Capital: {summary.capital} · Population:{" "}
          {summary.population.toLocaleString()}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Governor
        </h3>
        <p className="mt-1">
          {summary.governor.name}{" "}
          <span className="text-zinc-500 dark:text-zinc-400">
            ({PARTY_LABEL[summary.governor.party]})
          </span>
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Senators
        </h3>
        <ul className="mt-1 flex flex-col gap-1">
          {summary.senators.map((senator) => (
            <li key={senator.name}>
              {senator.name}{" "}
              <span className="text-zinc-500 dark:text-zinc-400">
                ({PARTY_LABEL[senator.party]})
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-600">
        Mock data — not yet synced from Supabase.
      </p>
    </div>
  );
}
