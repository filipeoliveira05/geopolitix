import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName } from "@/lib/states";
import {
  getGovernorById,
  getTermsForGovernor,
  getTermsForPerson,
  governorFullName,
  type GovernorTerm,
} from "@/lib/governors-data";
import { PartyBadge } from "@/components/PartyBadge";
import { SyncFreshnessNote } from "@/components/SyncFreshnessNote";
import {
  WikipediaVerifiedBadge,
  WikipediaSourcedBadge,
  WikipediaNoPageBadge,
} from "@/components/WikipediaVerifiedBadge";
import { SectionHeading } from "@/components/SectionHeading";
import { BackToMapLink } from "@/components/BackToMapLink";

type Profile = {
  name: string;
  party: string | null;
  photoUrl: string | null;
  bioSummary: string | null;
  wikipediaTitle: string | null;
  wikipediaVerified: boolean;
  wikipediaCheckedNo: boolean;
  stateId: string;
  terms: GovernorTerm[];
  lastSyncedAt: Date | null;
};

/**
 * `id` is either a current officeholder's `governors.id` (OpenStates,
 * except for the states OpenStates has no Governor entry for — see
 * getGovernor()'s fallback in governors-data.ts, which uses a Wikidata id
 * there instead) or, falling back, a historical governor's
 * `wikidata_person_id` — the two id formats don't collide, so trying the
 * current lookup first and falling back is safe.
 */
async function loadProfile(id: string): Promise<Profile | null> {
  const governor = await getGovernorById(id);
  if (governor) {
    const terms = await getTermsForGovernor(id, governor.stateId);
    return {
      name: governorFullName(governor),
      party: governor.party,
      photoUrl: governor.photoUrl,
      bioSummary: governor.bioSummary,
      wikipediaTitle: governor.wikipediaTitle,
      wikipediaVerified: governor.wikipediaVerified,
      wikipediaCheckedNo: governor.wikipediaCheckedNo,
      stateId: governor.stateId,
      terms,
      lastSyncedAt: governor.lastSyncedAt,
    };
  }

  const terms = await getTermsForPerson(id);
  if (terms.length === 0) return null;
  // Terms are newest-first — the most recent one best represents "current"
  // party/state for someone who may have served non-consecutive terms.
  const [mostRecent] = terms;
  return {
    name: mostRecent.name,
    party: mostRecent.party,
    photoUrl: mostRecent.photoUrl,
    bioSummary: mostRecent.bioSummary,
    wikipediaTitle: mostRecent.wikipediaTitle,
    wikipediaVerified: mostRecent.wikipediaVerified,
    wikipediaCheckedNo: mostRecent.wikipediaCheckedNo,
    stateId: mostRecent.stateId,
    terms,
    lastSyncedAt: mostRecent.lastSyncedAt,
  };
}

export async function generateMetadata(props: PageProps<"/governor/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const profile = await loadProfile(id);
  return {
    title: profile ? `${profile.name} — Geopolitix` : "Geopolitix",
  };
}

export default async function GovernorPage(props: PageProps<"/governor/[id]">) {
  const { id } = await props.params;
  const profile = await loadProfile(id);
  if (!profile) notFound();

  const stateName = getStateName(profile.stateId) ?? profile.stateId;

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      <div className="mt-2 flex items-center gap-4">
        {profile.photoUrl && (
          // `fill`, not width/height props — see legislator/[id]/page.tsx's
          // comment on the same pattern for why (a real Next.js dev-warning
          // race with non-square source photos + object-cover cropping).
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded">
            <Image src={profile.photoUrl} alt="" fill unoptimized className="object-cover" />
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">{profile.name}</h1>
          <p className="text-sm text-muted">
            <PartyBadge party={profile.party} /> Governor of{" "}
            <Link href={`/state/${profile.stateId}`} className="link-accent">
              {stateName}
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 border-b border-rule pb-1">
          <SectionHeading>Biography</SectionHeading>
          {profile.bioSummary &&
            (profile.wikipediaVerified ? (
              <WikipediaVerifiedBadge title={profile.wikipediaTitle} />
            ) : (
              <WikipediaSourcedBadge title={profile.wikipediaTitle} source="wikidata" />
            ))}
          {!profile.bioSummary && profile.wikipediaCheckedNo && <WikipediaNoPageBadge />}
        </div>
        <p className="mt-1 text-sm text-muted">{profile.bioSummary ?? "Not synced yet."}</p>
      </div>

      <div className="mt-6">
        <div className="border-b border-rule pb-1">
          <SectionHeading>Term history</SectionHeading>
        </div>
        {profile.terms.length > 0 ? (
          <div className="mt-2 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {profile.terms.map((term) => (
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
                      Governor of {getStateName(term.stateId) ?? term.stateId}
                    </td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                      <PartyBadge party={term.party} />
                    </td>
                    <td className="py-1.5 text-right align-middle whitespace-nowrap font-mono text-muted">
                      {term.startDate ?? "?"} – {term.endDate ?? (term.isCurrent ? "present" : "?")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted">
            Term dates not available — OpenStates has no history, and this person&apos;s Wikidata
            term record didn&apos;t match cleanly (see sync_logs).
          </p>
        )}
      </div>

      <footer className="mt-6 py-6 text-center">
        <SyncFreshnessNote label="This governor" syncedAt={profile.lastSyncedAt} />
      </footer>
    </div>
  );
}
