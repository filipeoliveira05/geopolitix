import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import {
  getLegislatorById,
  getTermsForLegislator,
  legislatorFullName,
} from "@/lib/legislators-data";
import { PartyBadge } from "@/components/PartyBadge";
import { GlobalFooter } from "@/components/GlobalFooter";
import { WikipediaVerifiedBadge, WikipediaNoPageBadge } from "@/components/WikipediaVerifiedBadge";

const CHAMBER_LABELS = { senate: "U.S. Senate", house: "U.S. House" } as const;

export async function generateMetadata(
  props: PageProps<"/legislator/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const legislator = await getLegislatorById(id);
  return {
    title: legislator ? `${legislatorFullName(legislator)} — Geopolitix` : "Geopolitix",
  };
}

export default async function LegislatorPage(props: PageProps<"/legislator/[id]">) {
  const { id } = await props.params;
  const legislator = await getLegislatorById(id);
  if (!legislator) notFound();

  const terms = await getTermsForLegislator(id);
  const currentTerm = terms.find((t) => t.isCurrent) ?? terms[0] ?? null;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to map
      </Link>

      <div className="mt-2 flex items-center gap-4">
        {legislator.photoUrl && (
          <Image
            src={legislator.photoUrl}
            alt=""
            width={80}
            height={80}
            unoptimized
            className="h-20 w-20 rounded object-cover"
          />
        )}
        <div>
          <h1 className="text-3xl font-semibold">{legislatorFullName(legislator)}</h1>
          {currentTerm && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              <PartyBadge party={currentTerm.party} />{" "}
              {currentTerm.isCurrent ? "Currently serving in" : "Last served in"} the{" "}
              {CHAMBER_LABELS[currentTerm.chamber]}
              {currentTerm.stateId && ` (${getStateName(currentTerm.stateId) ?? currentTerm.stateId})`}
            </p>
          )}
        </div>
      </div>

      {legislator.birthday && (
        <p className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
          Born {legislator.birthday}
        </p>
      )}

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Biography
          </h2>
          {legislator.bioSummary && legislator.wikipediaVerified && (
            <WikipediaVerifiedBadge title={legislator.wikipediaTitle} />
          )}
          {!legislator.bioSummary && legislator.wikipediaCheckedNo && <WikipediaNoPageBadge />}
        </div>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {legislator.bioSummary ?? "Not synced yet."}
        </p>
      </div>

      <div className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Term history
        </h2>
        {terms.length > 0 ? (
          <div className="mt-1 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {terms.map((term) => (
                  <tr
                    key={term.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="w-px py-1.5 pr-1.5 align-middle">
                      {term.isCurrent && (
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                          title="Current term"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-middle">
                      {CHAMBER_LABELS[term.chamber]} —{" "}
                      {term.chamber === "house"
                        ? `${getStateName(term.stateId) ?? term.stateId} ${
                            term.district === 0 ? "At-large" : `District ${term.district}`
                          }`
                        : getStateName(term.stateId) ?? term.stateId}
                    </td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                      <PartyBadge party={term.party} />
                    </td>
                    <td className="py-1.5 text-right align-middle whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {term.startDate} – {term.endDate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">No term data.</p>
        )}
      </div>

      <GlobalFooter />
    </div>
  );
}
