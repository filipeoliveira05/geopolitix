import Link from "next/link";
import { candidateHref, primaryPendingMessage, type Race } from "@/lib/races-data";
import { PartyBadge } from "@/components/PartyBadge";

/**
 * One race's row — state/district label + status dot + candidate faceoff.
 * Shared by /midterms-2026's Senate/Governor tables (server-rendered) and
 * its House per-state expanded district tables (client-rendered, fetched
 * on demand) — same row shape either way, just a different label.
 */
export function RaceRow({ race, label }: { race: Race; label: React.ReactNode }) {
  const pendingMessage = primaryPendingMessage(race);
  return (
    <tr className="border-b border-rule last:border-0">
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
        {pendingMessage ? (
          <span className="text-muted">{pendingMessage}</span>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {race.candidates.map((candidate) => {
              const href = candidateHref(candidate);
              return (
                <span key={candidate.id} className="whitespace-nowrap">
                  {href ? (
                    <Link href={href} className="link-accent">
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
