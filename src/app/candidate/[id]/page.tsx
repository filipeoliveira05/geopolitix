import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import { getCandidateById } from "@/lib/candidates-data";
import { PartyBadge } from "@/components/PartyBadge";
import { GlobalFooter } from "@/components/GlobalFooter";
import { WikipediaVerifiedBadge, WikipediaNoPageBadge } from "@/components/WikipediaVerifiedBadge";

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
  const officeLabel =
    race.office === "house" && race.districtNumber !== null
      ? `${OFFICE_LABELS.house} — ${race.districtNumber === 0 ? "At-large" : `District ${race.districtNumber}`}`
      : OFFICE_LABELS[race.office];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to map
      </Link>

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
          <h1 className="text-3xl font-semibold">{candidate.name}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            <PartyBadge party={race.party} /> {race.isIncumbent && "Incumbent — "}Running for{" "}
            {officeLabel} in {getStateName(race.stateId) ?? race.stateId}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Biography
          </h2>
          {candidate.bioSummary && candidate.wikipediaVerified && (
            <WikipediaVerifiedBadge title={candidate.wikipediaTitle} />
          )}
          {!candidate.bioSummary && candidate.wikipediaCheckedNo && <WikipediaNoPageBadge />}
        </div>
        {candidate.bioSummary ? (
          <>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{candidate.bioSummary}</p>
            {!candidate.wikipediaVerified && (
              <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-600">
                Bio matched automatically from Wikipedia and hasn&apos;t been manually verified.
              </p>
            )}
          </>
        ) : (
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            No biography available yet.
          </p>
        )}
      </div>

      <GlobalFooter />
    </div>
  );
}
