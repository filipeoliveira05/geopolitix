import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getStateName, isValidStateAbbr } from "@/lib/states";
import { getMockStateSummary } from "@/lib/mock-states";
import {
  getCurrentSenators,
  getCurrentRepresentatives,
  getSenateHistory,
  getHouseHistory,
} from "@/lib/legislators-data";
import { getGovernor, getGovernorHistory, governorFullName } from "@/lib/governors-data";
import { getRacesForState } from "@/lib/races-data";
import { StateTabs } from "@/components/StateTabs";
import { SyncFreshnessRow } from "@/components/SyncFreshnessNote";
import { getJobFreshness } from "@/lib/sync-freshness";
import { BackToMapLink } from "@/components/BackToMapLink";

export async function generateMetadata(
  props: PageProps<"/state/[abbr]">,
): Promise<Metadata> {
  const { abbr: rawAbbr } = await props.params;
  const abbr = rawAbbr.toUpperCase();
  const name = getStateName(abbr);
  return { title: name ? `${name} (${abbr}) — Geopolitix` : "Geopolitix" };
}

export default async function StatePage(props: PageProps<"/state/[abbr]">) {
  const { abbr: rawAbbr } = await props.params;
  const abbr = rawAbbr.toUpperCase();

  if (!isValidStateAbbr(abbr)) {
    notFound();
  }

  const name = getStateName(abbr)!;
  const summary = getMockStateSummary(abbr);
  const [
    governor,
    senators,
    representatives,
    senateHistory,
    houseHistory,
    governorHistory,
    races,
  ] = await Promise.all([
    getGovernor(abbr),
    getCurrentSenators(abbr),
    getCurrentRepresentatives(abbr),
    getSenateHistory(abbr),
    getHouseHistory(abbr),
    getGovernorHistory(abbr),
    getRacesForState(abbr),
  ]);
  const [legislatorsSyncedAt, governorsSyncedAt, governorHistorySyncedAt] = await Promise.all([
    getJobFreshness(["legislators"]),
    getJobFreshness(["governors"]),
    getJobFreshness(["governor_history"]),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 animate-fade-in p-6 sm:p-10">
      <BackToMapLink />

      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
        {name} <span className="text-muted">({abbr})</span>
      </h1>
      <SyncFreshnessRow
        items={[
          { label: "Legislators", syncedAt: legislatorsSyncedAt },
          { label: "Governor", syncedAt: governorsSyncedAt },
          { label: "Governor history", syncedAt: governorHistorySyncedAt },
        ]}
        className="mt-1"
      />

      <div className="mt-6">
        <StateTabs
          abbr={abbr}
          name={name}
          governor={
            governor
              ? { id: governor.id, name: governorFullName(governor), party: governor.party ?? "" }
              : null
          }
          capital={summary?.capital ?? null}
          population={summary?.population ?? null}
          senators={senators}
          representatives={representatives}
          senateHistory={senateHistory}
          houseHistory={houseHistory}
          governorHistory={governorHistory}
          races={races}
        />
      </div>
    </div>
  );
}
