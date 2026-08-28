"use client";

import Link from "next/link";
import { useState } from "react";
import { PartyBadge } from "@/components/PartyBadge";
import {
  legislatorFullName,
  type TermWithLegislator,
} from "@/lib/legislators-data";
import type { GovernorTerm } from "@/lib/governors-data";
import { isPrimaryPending, type Race } from "@/lib/races-data";

type TabKey = "current" | "history" | "geography" | "midterms";

const TABS: { key: TabKey; label: string }[] = [
  { key: "current", label: "Current representation" },
  { key: "history", label: "History" },
  { key: "geography", label: "Geography" },
  { key: "midterms", label: "2026 Midterms" },
];

export type StateTabsProps = {
  abbr: string;
  name: string;
  governor: { id: string; name: string; party: string } | null;
  capital: string | null;
  population: number | null;
  senators: TermWithLegislator[];
  representatives: TermWithLegislator[];
  senateHistory: TermWithLegislator[];
  houseHistory: TermWithLegislator[];
  governorHistory: GovernorTerm[];
  races: Race[];
};

export function StateTabs(props: StateTabsProps) {
  const [tab, setTab] = useState<TabKey>("current");

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="py-6">
        {tab === "current" && <CurrentTab {...props} />}
        {tab === "history" && <HistoryTab {...props} />}
        {tab === "geography" && <GeographyTab {...props} />}
        {tab === "midterms" && <MidtermsTab {...props} />}
      </div>
    </div>
  );
}

function CurrentTab({
  governor,
  senators,
  representatives,
}: StateTabsProps) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Governor">
        {governor ? (
          <p>
            <Link href={`/governor/${governor.id}`} className="hover:underline">
              {governor.name}
            </Link>{" "}
            <PartyBadge party={governor.party} />
          </p>
        ) : (
          <Empty>No governor data for this state.</Empty>
        )}
      </Section>

      <Section title="Senators">
        {senators.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {senators.map(({ legislator, term }) => (
              <li key={legislator.id}>
                <Link href={`/legislator/${legislator.id}`} className="hover:underline">
                  {legislatorFullName(legislator)}
                </Link>{" "}
                <PartyBadge party={term.party} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No senators (territory or non-voting delegate only).</Empty>
        )}
      </Section>

      <Section title="House representatives">
        {representatives.length > 0 ? (
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {representatives.map(({ legislator, term }) => (
              <li key={legislator.id}>
                {term.district === 0 ? "At-large" : `District ${term.district}`}:{" "}
                <Link href={`/legislator/${legislator.id}`} className="hover:underline">
                  {legislatorFullName(legislator)}
                </Link>{" "}
                <PartyBadge party={term.party} />
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No representative data.</Empty>
        )}
      </Section>
    </div>
  );
}

function HistoryTab({ senateHistory, houseHistory, governorHistory }: StateTabsProps) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Senators over time">
        {senateHistory.length > 0 ? (
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {senateHistory.map(({ legislator, term }) => (
                  <tr
                    key={term.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="w-px py-1.5 pr-1.5 align-middle">
                      {term.isCurrent && (
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                          title="Current senator"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-middle">
                      <Link href={`/legislator/${legislator.id}`} className="hover:underline">
                        {legislatorFullName(legislator)}
                      </Link>
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
          <Empty>No Senate history data.</Empty>
        )}
      </Section>

      <Section title="Representatives over time">
        {houseHistory.length > 0 ? (
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {houseHistory.map(({ legislator, term }) => (
                  <tr
                    key={term.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="w-px py-1.5 pr-1.5 align-middle">
                      {term.isCurrent && (
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                          title="Current representative"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-middle">
                      <Link href={`/legislator/${legislator.id}`} className="hover:underline">
                        {legislatorFullName(legislator)}
                      </Link>
                    </td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {term.district === 0 ? "At-large" : `District ${term.district}`}
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
          <Empty>No House history data.</Empty>
        )}
      </Section>

      <Section title="Governors over time">
        {governorHistory.length > 0 ? (
          <div className="overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[26rem] border-collapse text-sm">
              <tbody>
                {governorHistory.map((term) => (
                  <tr
                    key={term.id}
                    className="border-b border-zinc-100 last:border-0 dark:border-zinc-800"
                  >
                    <td className="w-px py-1.5 pr-1.5 align-middle">
                      {term.isCurrent && (
                        <span
                          className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                          title="Current governor"
                        />
                      )}
                    </td>
                    <td className="py-1.5 pr-3 align-middle">
                      <Link
                        href={`/governor/${term.governorId ?? term.wikidataPersonId}`}
                        className="hover:underline"
                      >
                        {term.name}
                      </Link>
                    </td>
                    <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                      <PartyBadge party={term.party} />
                    </td>
                    <td className="py-1.5 text-right align-middle whitespace-nowrap text-zinc-500 dark:text-zinc-400">
                      {term.startDate ?? "?"} – {term.endDate ?? (term.isCurrent ? "present" : "?")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>No governor history data.</Empty>
        )}
      </Section>
    </div>
  );
}

function GeographyTab({ capital, population }: StateTabsProps) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Overview">
        {capital || population ? (
          <p>
            {capital && <>Capital: {capital}</>}
            {capital && population && " · "}
            {population && <>Population: {population.toLocaleString()}</>}
          </p>
        ) : (
          <Empty>No geography data yet — not synced for this state.</Empty>
        )}
      </Section>

      <Section title="Most populous cities">
        <Empty>Not built yet — Phase 2 of the plan.</Empty>
      </Section>

      <Section title="Sports teams">
        <Empty>Not built yet — Phase 2 of the plan.</Empty>
      </Section>
    </div>
  );
}

const OFFICE_LABELS: Record<Race["office"], string> = {
  senate: "U.S. Senate",
  governor: "Governor",
  house: "U.S. House",
};

function MidtermsTab({ races }: StateTabsProps) {
  return (
    <div className="flex flex-col gap-6">
      {races.length > 0 ? (
        races.map((race) => (
          <Section key={race.id} title={OFFICE_LABELS[race.office]}>
            <p className="mb-1 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {race.status !== "called" && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
              )}
              {race.status === "called" ? "Called" : "Not yet decided"}
            </p>
            {isPrimaryPending(race) ? (
              <Empty>Primary not yet held.</Empty>
            ) : (
              <ul className="flex flex-col gap-1">
                {race.candidates.map((candidate) => (
                  <li key={candidate.id}>
                    {candidate.name} <PartyBadge party={candidate.party} />
                    {candidate.isIncumbent && (
                      <span className="text-zinc-500 dark:text-zinc-400"> (incumbent)</span>
                    )}
                    {candidate.id === race.winnerCandidateId && (
                      <span className="text-zinc-500 dark:text-zinc-400"> — winner</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ))
      ) : (
        <Section title="2026 Midterms">
          <Empty>
            No Senate or Governor race in this state this cycle. House isn&apos;t synced (see
            the plan&apos;s non-goals) — this is not a real-time results feed either way.
          </Empty>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-zinc-500 dark:text-zinc-400">{children}</p>
  );
}
