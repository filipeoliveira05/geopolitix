import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  getCurrentSenators,
  getSenatorsAsOf,
  getCurrentRepresentatives,
  getRepresentativesAsOf,
  legislatorFullName,
} from "@/lib/legislators-data";
import { getGovernor, getGovernorAsOf, governorFullName } from "@/lib/governors-data";
import { getStateGeography } from "@/lib/geography-data";
import { getStateName } from "@/lib/states";
import { asOfDateForYear, yearLabel, type ElectionYear } from "@/lib/election-years";
import { PartyBadge } from "@/components/PartyBadge";
import { RepresentativesList } from "@/components/RepresentativesList";
import { SectionHeading } from "@/components/SectionHeading";

type StatePanelProps = {
  abbr: string | null;
  /** District clicked on the map's districts layer, if any — highlights the matching row below. */
  selectedDistrict?: number | null;
  /** Clears the selection, e.g. via a close button — omitted when the panel has nothing to close. */
  onClose?: () => void;
  /** The home map's selected year (see src/lib/election-years.ts). */
  year?: ElectionYear;
};

export function StatePanel({
  abbr,
  selectedDistrict = null,
  onClose,
  year = "current",
}: StatePanelProps) {
  const asOfDate = asOfDateForYear(year);
  const {
    data: geography,
    isError: geographyError,
    refetch: refetchGeography,
  } = useQuery({
    queryKey: ["geography", abbr],
    queryFn: () => getStateGeography(abbr as string),
    enabled: abbr !== null,
  });
  const {
    data: governor,
    isError: governorError,
    refetch: refetchGovernor,
  } = useQuery({
    queryKey: ["governor", abbr, asOfDate ?? "current"],
    queryFn: () =>
      asOfDate ? getGovernorAsOf(abbr as string, asOfDate) : getGovernor(abbr as string),
    enabled: abbr !== null,
  });
  const {
    data: senators,
    isError: senatorsError,
    refetch: refetchSenators,
  } = useQuery({
    queryKey: ["senators", abbr, asOfDate ?? "current"],
    queryFn: () =>
      asOfDate ? getSenatorsAsOf(abbr as string, asOfDate) : getCurrentSenators(abbr as string),
    enabled: abbr !== null,
  });
  const {
    data: representatives,
    isError: representativesError,
    refetch: refetchRepresentatives,
  } = useQuery({
    queryKey: ["representatives", abbr, asOfDate ?? "current"],
    queryFn: () =>
      asOfDate
        ? getRepresentativesAsOf(abbr as string, asOfDate)
        : getCurrentRepresentatives(abbr as string),
    enabled: abbr !== null,
  });

  if (!abbr) {
    return (
      <div className="p-6 text-sm text-muted">
        Click a state on the map to see its current representation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-semibold text-ink">
            {getStateName(abbr) ?? abbr} <span className="text-muted">({abbr})</span>
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close panel"
              className="rounded p-1 text-muted hover:bg-seal-soft hover:text-seal"
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
        {geographyError ? (
          <FetchError onRetry={() => refetchGeography()} />
        ) : geography?.capitalName || geography?.population ? (
          <p className="text-sm text-muted">
            {geography.capitalName && <>Capital: {geography.capitalName}</>}
            {geography.capitalName && geography.population && " · "}
            {geography.population && <>Population: {geography.population.toLocaleString()}</>}
          </p>
        ) : null}
        <Link href={`/state/${abbr}`} className="link-accent mt-1 inline-block text-sm text-seal">
          View full state page →
        </Link>
      </div>

      <div>
        <SectionHeading as="h3">
          Governor{" "}
          {year !== "current" && (
            <span className="normal-case text-muted">({yearLabel(year)} election)</span>
          )}
        </SectionHeading>
        {governorError ? (
          <FetchError onRetry={() => refetchGovernor()} />
        ) : governor === undefined ? (
          <p className="mt-1 text-sm text-muted">Loading…</p>
        ) : governor ? (
          <p className="mt-1">
            <Link href={`/governor/${governor.id}`} className="link-accent">
              {governorFullName(governor)}
            </Link>{" "}
            <PartyBadge party={governor.party} />
          </p>
        ) : (
          <p className="mt-1 text-sm text-muted">No governor data.</p>
        )}
      </div>

      <div>
        <SectionHeading as="h3">
          Senators{" "}
          {year !== "current" && (
            <span className="normal-case text-muted">({yearLabel(year)} election)</span>
          )}
        </SectionHeading>
        {senatorsError ? (
          <FetchError onRetry={() => refetchSenators()} />
        ) : senators === undefined ? (
          <p className="mt-1 text-sm text-muted">Loading…</p>
        ) : senators.length > 0 ? (
          <ul className="mt-1 flex flex-col gap-1">
            {senators.map(({ legislator, term }) => (
              <li key={legislator.id}>
                <Link href={`/legislator/${legislator.id}`} className="link-accent">
                  {legislatorFullName(legislator)}
                </Link>{" "}
                <PartyBadge party={term.party} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">
            No senators (territory or non-voting delegate only).
          </p>
        )}
      </div>

      <div>
        <SectionHeading as="h3">
          House representatives{" "}
          {year !== "current" && (
            <span className="normal-case text-muted">({yearLabel(year)} election)</span>
          )}
        </SectionHeading>
        {representativesError ? (
          <FetchError onRetry={() => refetchRepresentatives()} />
        ) : representatives === undefined ? (
          <p className="mt-1 text-sm text-muted">Loading…</p>
        ) : representatives.length > 0 ? (
          <RepresentativesList
            representatives={representatives}
            selectedDistrict={selectedDistrict}
          />
        ) : (
          <p className="mt-1 text-sm text-muted">No representative data.</p>
        )}
      </div>
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
