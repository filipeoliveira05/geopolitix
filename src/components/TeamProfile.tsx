import Image from "next/image";
import Link from "next/link";
import { getStateName } from "@/lib/states";
import { SyncFreshnessNote } from "@/components/SyncFreshnessNote";
import { WikipediaSourcedBadge } from "@/components/WikipediaVerifiedBadge";
import { SectionHeading } from "@/components/SectionHeading";
import { BackToMapLink } from "@/components/BackToMapLink";

// Shared by /team/[id] (sports_teams), /college-football/[id], and /college-basketball/[id] — same
// row shape (name, logo, home city/state, a category label — league for pro teams, conference for
// college programs — and a Wikipedia-sourced bio), so one presentational component serves all
// three thin route pages rather than tripling this layout. No wikipedia_verified/checked_no
// columns exist here (unlike candidates/legislators/governors) — nobody has manually audited these
// bios, so a present bio always shows WikipediaSourcedBadge (never the emerald "verified" badge),
// and a missing one shows no badge at all rather than WikipediaNoPageBadge's "a human confirmed no
// article exists" claim, which would be false for a row nobody's actually checked.
export type TeamProfileData = {
  name: string;
  nickname: string | null;
  logoUrl: string | null;
  cityName: string;
  stateId: string;
  categoryLabel: string; // "NFL", "MLS", ... or a conference name
  bioSummary: string | null;
  wikipediaTitle: string | null;
  // This exact row's own last_synced_at, not a table-wide/job-wide figure — a sports/college
  // table's own sync upserts every row in one call per run, so this happens to be identical
  // across every row in the same table today, but reads from the row itself rather than
  // sync_logs regardless, matching legislators/governors/candidates' identical per-row approach.
  lastSyncedAt: Date | null;
};

export function TeamProfile({ team, syncLabel }: { team: TeamProfileData; syncLabel: string }) {
  const stateName = getStateName(team.stateId) ?? team.stateId;
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      <div className="mt-2 flex items-center gap-4">
        {team.logoUrl && (
          <div className="relative h-20 w-20 shrink-0">
            <Image src={team.logoUrl} alt="" fill unoptimized className="object-contain" />
          </div>
        )}
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink">
            {team.name}
            {team.nickname && <span className="text-muted"> {team.nickname}</span>}
          </h1>
          <p className="text-sm text-muted">
            {team.categoryLabel} —{" "}
            <Link href={`/state/${team.stateId}`} className="link-accent">
              {team.cityName}, {stateName}
            </Link>
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-2 border-b border-rule pb-1">
          <SectionHeading>About</SectionHeading>
          {team.bioSummary && <WikipediaSourcedBadge title={team.wikipediaTitle} source="wikipedia-list" />}
        </div>
        <p className="mt-1 text-sm text-muted">{team.bioSummary ?? "No biography available yet."}</p>
      </div>

      <footer className="mt-6 py-6 text-center">
        <SyncFreshnessNote label={syncLabel} syncedAt={team.lastSyncedAt} possessive />
      </footer>
    </div>
  );
}
