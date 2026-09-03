import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getCandidateById } from "@/lib/candidates-data";
import { PartyBadge } from "@/components/PartyBadge";
import { SyncFreshnessNote } from "@/components/SyncFreshnessNote";
import { getJobFreshness } from "@/lib/sync-freshness";
import { WikipediaVerifiedBadge, WikipediaNoPageBadge } from "@/components/WikipediaVerifiedBadge";
import { SectionHeading } from "@/components/SectionHeading";
import { BackToMapLink } from "@/components/BackToMapLink";

const OFFICE_LABELS = {
  senate: "U.S. Senate",
  governor: "Governor",
  house: "U.S. House",
} as const;

export async function generateMetadata(
  props: PageProps<"/candidate/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const candidate = await getCandidateById(id);
  return { title: candidate ? `${candidate.name} — Geopolitix` : "Geopolitix" };
}

export default async function CandidatePage(props: PageProps<"/candidate/[id]">) {
  const { id } = await props.params;
  const candidate = await getCandidateById(id);
  if (!candidate || !candidate.race) notFound();

  const { race } = candidate;
  // Both jobs actually touch a candidate row — races.mjs matches/inserts it, and
  // races_candidate_backfill later fills bio/photo on the same row — so the more recent of the
  // two is the honest "last touched" answer, not just one or the other.
  const syncedAt = await getJobFreshness(["races", "races_candidate_backfill"]);
  const officeLabel =
    race.office === "house" && race.districtNumber !== null
      ? `${OFFICE_LABELS.house} — ${race.districtNumber === 0 ? "At-large" : `District ${race.districtNumber}`}`
      : OFFICE_LABELS[race.office];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      <div className="mt-2 flex items-center gap-4">
        {candidate.photoUrl && (
          // `fill`, not width/height props — see legislator/[id]/page.tsx's
          // comment on the same pattern for why (a real Next.js dev-warning
          // race with non-square source photos + object-cover cropping).
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded">
            <Image src={candidate.photoUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{candidate.name}</h1>
          <p className="text-sm text-muted">
            <PartyBadge party={race.party} /> {race.isIncumbent && "Incumbent — "}Running for{" "}
            {officeLabel} in {getStateName(race.stateId) ?? race.stateId}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 border-b border-rule pb-1">
          <SectionHeading>Biography</SectionHeading>
          {candidate.bioSummary && candidate.wikipediaVerified && (
            <WikipediaVerifiedBadge title={candidate.wikipediaTitle} />
          )}
          {!candidate.bioSummary && candidate.wikipediaCheckedNo && <WikipediaNoPageBadge />}
        </div>
        {candidate.bioSummary ? (
          <>
            <p className="mt-1 text-sm text-muted">{candidate.bioSummary}</p>
            {!candidate.wikipediaVerified && (
              <p className="mt-2 text-xs text-muted">
                Bio matched automatically from Wikipedia and hasn&apos;t been manually verified.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">No biography available yet.</p>
        )}
      </div>

      <footer className="mt-6 py-6 text-center">
        <SyncFreshnessNote label="Candidates" syncedAt={syncedAt} />
      </footer>
    </div>
  );
}
