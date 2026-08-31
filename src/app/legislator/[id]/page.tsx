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
import {
  WikipediaVerifiedBadge,
  WikipediaSourcedBadge,
  WikipediaNoPageBadge,
} from "@/components/WikipediaVerifiedBadge";
import { SectionHeading } from "@/components/SectionHeading";
import { BackToMapLink } from "@/components/BackToMapLink";

const CHAMBER_LABELS = { senate: "U.S. Senate", house: "U.S. House" } as const;

// -1 is a real congress-legislators convention (pre-1967 Apportionment Act
// multi-member "general ticket" seats), not missing data — distinct from 0,
// a genuine single at-large seat. See StateTabs.tsx's districtLabel for the
// same fix applied to the state History tab.
function districtLabel(district: number | null): string {
  if (district === 0) return "At-large";
  if (district === -1) return "At-large (multi-member)";
  return `District ${district}`;
}

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
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      <div className="mt-2 flex items-center gap-4">
        {legislator.photoUrl && (
          // `fill` (not width/height props) — the source photo isn't
          // square (450x550), and pairing fixed width/height props with
          // object-cover CSS to force a square crop is a known Next.js
          // dev-warning race: the cached <img>'s `load` event can fire
          // before Tailwind's box-sizing classes finish cascading,
          // triggering a spurious "width or height modified" warning.
          // `fill` sidesteps that check entirely — it's the pattern
          // Next.js itself recommends for cropping to a fixed box.
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded">
            <Image src={legislator.photoUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {legislatorFullName(legislator)}
          </h1>
          {currentTerm && (
            <p className="text-sm text-muted">
              <PartyBadge party={currentTerm.party} />{" "}
              {currentTerm.isCurrent ? "Currently serving in" : "Last served in"} the{" "}
              {CHAMBER_LABELS[currentTerm.chamber]}
              {currentTerm.stateId && ` (${getStateName(currentTerm.stateId) ?? currentTerm.stateId})`}
            </p>
          )}
        </div>
      </div>

      {legislator.birthday && <p className="mt-4 text-sm text-muted">Born {legislator.birthday}</p>}

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 border-b border-rule pb-1">
          <SectionHeading>Biography</SectionHeading>
          {legislator.bioSummary &&
            (legislator.wikipediaVerified ? (
              <WikipediaVerifiedBadge title={legislator.wikipediaTitle} />
            ) : (
              <WikipediaSourcedBadge title={legislator.wikipediaTitle} source="congress-legislators" />
            ))}
          {!legislator.bioSummary && legislator.wikipediaCheckedNo && <WikipediaNoPageBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">{legislator.bioSummary ?? "Not synced yet."}</p>
      </div>

      <div className="mt-6">
        <div className="border-b border-rule pb-1">
          <SectionHeading>Term history</SectionHeading>
        </div>
        {terms.length > 0 ? (
          <div className="mt-2 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id} className="border-b border-rule last:border-0">
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
                        ? `${getStateName(term.stateId) ?? term.stateId} ${districtLabel(term.district)}`
                        : getStateName(term.stateId) ?? term.stateId}
                    </td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                      <PartyBadge party={term.party} />
                    </td>
                    <td className="py-1.5 text-right align-middle whitespace-nowrap font-mono text-muted">
                      {term.startDate} – {term.endDate}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">No term data.</p>
        )}
      </div>

      <GlobalFooter />
    </div>
  );
}
