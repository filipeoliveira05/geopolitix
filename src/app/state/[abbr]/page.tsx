import Link from "next/link";
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

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 p-6 sm:p-10">
      <Link
        href="/"
        className="text-sm text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      >
        ← Back to map
      </Link>

      <h1 className="mt-2 text-3xl font-semibold">
        {name} <span className="text-zinc-400 dark:text-zinc-600">({abbr})</span>
      </h1>

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
