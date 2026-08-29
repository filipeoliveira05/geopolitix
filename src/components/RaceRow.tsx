import Link from "next/link";
import { isPrimaryPending, type Race, type RaceCandidate } from "@/lib/races-data";
import { PartyBadge } from "@/components/PartyBadge";

/**
 * A matched officeholder's existing profile always wins over the new
 * candidate page — no duplicate content for someone who already has a
 * richer page with full term history. candidateId is guaranteed present
 * on the unmatched branch (races-2026.mjs always creates a `candidates`
 * row for an unmatched, non-placeholder candidate).
 */
function candidateHref(candidate: RaceCandidate): string | null {
  if (candidate.matchedLegislatorId) return `/legislator/${candidate.matchedLegislatorId}`;
  if (candidate.matchedGovernorId) return `/governor/${candidate.matchedGovernorId}`;
  if (candidate.candidateId) return `/candidate/${candidate.candidateId}`;
  return null; // a placeholder ("TBD"/"(presumptive)") — isPrimaryPending already hides these
}

/**
 * One race's row — state/district label + status dot + candidate faceoff.
 * Shared by /midterms-2026's Senate/Governor tables (server-rendered) and
 * its House per-state expanded district tables (client-rendered, fetched
 * on demand) — same row shape either way, just a different label.
 */
export function RaceRow({ race, label }: { race: Race; label: React.ReactNode }) {
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
            {race.candidates.map((candidate) => {
              const href = candidateHref(candidate);
              return (
                <span key={candidate.id} className="whitespace-nowrap">
                  {href ? (
                    <Link href={href} className="hover:underline">
                      {candidate.name}
                    </Link>
                  ) : (
                    candidate.name
                  )}{" "}
                  <PartyBadge party={candidate.party} />
                </span>
              );
            })}
          </div>
        )}
      </td>
    </tr>
  );
}
