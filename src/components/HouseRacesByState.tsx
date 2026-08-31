"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStateName } from "@/lib/states";
import { getHouseRacesForState, type HouseStateSummary } from "@/lib/races-data";
import { RaceRow } from "@/components/RaceRow";

function HouseStateRow({
  summary,
  electionHasPassed,
}: {
  summary: HouseStateSummary;
  electionHasPassed: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  // enabled: isOpen — the whole point of this component: a state's House
  // races (with full candidate detail) are only fetched the first time its
  // row is expanded, not upfront for all 50 states. Collapsing and
  // re-expanding doesn't re-fetch — TanStack Query caches by queryKey.
  const {
    data: races,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["house-races", summary.stateId],
    queryFn: () => getHouseRacesForState(summary.stateId),
    enabled: isOpen,
  });

  // Pre-election this can only show a race count, not a primaries-held
  // count like Senate/Governor's cards do — that needs inspecting each
  // race's candidates for Wikipedia's TBD/presumptive placeholders (see
  // isPrimaryPending), which is exactly the per-candidate data this
  // summary line deliberately avoids fetching until the row is expanded.
  const summaryText = electionHasPassed
    ? `${summary.called}/${summary.total} called`
    : `${summary.total} race${summary.total === 1 ? "" : "s"}`;

  return (
    <div className="border-b border-rule last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          {/* An SVG rotates symmetrically around its viewBox center — a text
              glyph like "›" doesn't (its ink isn't centered in its own em
              box), so rotating that instead left it visibly off-center
              against the state name next to it. */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {getStateName(summary.stateId) ?? summary.stateId}
        </span>
        <span className="text-muted">{summaryText}</span>
      </button>
      {isOpen && (
        <div className="overflow-x-auto overflow-y-hidden pb-2 pl-5">
          {isLoading ? (
            <p className="py-1 text-xs text-muted">Loading districts…</p>
          ) : isError ? (
            <p className="py-1 text-xs text-muted">Couldn&apos;t load House races for this state.</p>
          ) : (
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {races?.map((race) => (
                  <RaceRow
                    key={race.id}
                    race={race}
                    label={
                      race.districtNumber === 0 ? "At-large" : `District ${race.districtNumber}`
                    }
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

export function HouseRacesByState({
  summaries,
  electionHasPassed,
}: {
  summaries: HouseStateSummary[];
  electionHasPassed: boolean;
}) {
  return (
    <div>
      {summaries.map((summary) => (
        <HouseStateRow key={summary.stateId} summary={summary} electionHasPassed={electionHasPassed} />
      ))}
    </div>
  );
}
