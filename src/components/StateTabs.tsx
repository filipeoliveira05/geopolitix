"use client";

import { useState } from "react";
import { PartyBadge } from "@/components/PartyBadge";
import {
  legislatorFullName,
  type TermWithLegislator,
} from "@/lib/legislators-data";

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
  governor: { name: string; party: string } | null;
  capital: string | null;
  population: number | null;
  senators: TermWithLegislator[];
  representatives: TermWithLegislator[];
  senateHistory: TermWithLegislator[];
};

export function StateTabs(props: StateTabsProps) {
  const [tab, setTab] = useState<TabKey>("current");

  return (
    <div>
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
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
            {governor.name} <PartyBadge party={governor.party} />
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
                {legislatorFullName(legislator)} <PartyBadge party={term.party} />
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
                {legislatorFullName(legislator)} <PartyBadge party={term.party} />
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

function HistoryTab({ senateHistory }: StateTabsProps) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Senators over time">
        {senateHistory.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {senateHistory.map(({ legislator, term }) => (
              <li key={term.id}>
                {legislatorFullName(legislator)} <PartyBadge party={term.party} />{" "}
                <span className="text-zinc-500 dark:text-zinc-400">
                  {term.startDate} – {term.endDate}
                  {term.isCurrent ? " (current)" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No Senate history data.</Empty>
        )}
      </Section>

      <Section title="Governors over time">
        <Empty>
          Governor history isn&apos;t synced yet — only the current governor exists so far.
        </Empty>
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

function MidtermsTab({ name }: StateTabsProps) {
  return (
    <Section title="2026 Midterms">
      <Empty>
        Race data for {name} isn&apos;t synced yet. When available, this will
        show candidates and confirmed race status (House/Senate/Governor) —
        not a real-time results feed; see the plan&apos;s non-goals.
      </Empty>
    </Section>
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
