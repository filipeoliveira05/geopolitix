"use client";

import Link from "next/link";
import { useState } from "react";
import { PartyBadge } from "@/components/PartyBadge";
import { SectionHeading } from "@/components/SectionHeading";
import {
  legislatorFullName,
  type TermWithLegislator,
} from "@/lib/legislators-data";
import type { GovernorTerm } from "@/lib/governors-data";
import { primaryPendingMessage, type Race } from "@/lib/races-data";

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
      <div className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-rule">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? "border-seal text-seal" : "border-transparent text-muted hover:text-ink"
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
            <Link href={`/governor/${governor.id}`} className="link-accent">
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
                <Link href={`/legislator/${legislator.id}`} className="link-accent">
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
                <Link href={`/legislator/${legislator.id}`} className="link-accent">
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

// Normalized shape every history table row renders from, regardless of
// source (Senate/House terms, governor terms) — lets HistoryTable,
// CappedHistorySection, and the House district grouping below all share one
// rendering path instead of three near-identical copies.
type HistoryRow = {
  id: string;
  isCurrent: boolean;
  currentTitle: string;
  href: string;
  name: string;
  party: string | null;
  startDate: string;
  endDate: string | null;
};

function senateRow({ legislator, term }: TermWithLegislator): HistoryRow {
  return {
    id: term.id,
    isCurrent: term.isCurrent,
    currentTitle: "Current senator",
    href: `/legislator/${legislator.id}`,
    name: legislatorFullName(legislator),
    party: term.party,
    startDate: term.startDate,
    endDate: term.endDate,
  };
}

function houseRow({ legislator, term }: TermWithLegislator): HistoryRow & { district: number } {
  return {
    id: term.id,
    isCurrent: term.isCurrent,
    currentTitle: "Current representative",
    href: `/legislator/${legislator.id}`,
    name: legislatorFullName(legislator),
    party: term.party,
    startDate: term.startDate,
    endDate: term.endDate,
    district: term.district ?? 0,
  };
}

function governorRow(term: GovernorTerm): HistoryRow {
  return {
    id: term.id,
    isCurrent: term.isCurrent,
    currentTitle: "Current governor",
    href: `/governor/${term.governorId ?? term.wikidataPersonId}`,
    name: term.name,
    party: term.party,
    startDate: term.startDate ?? "?",
    endDate: term.endDate ?? (term.isCurrent ? "present" : "?"),
  };
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  return (
    <div className="overflow-x-auto overflow-y-hidden">
      <table className="w-full min-w-[26rem] border-collapse text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-rule last:border-0">
              <td className="w-px py-1.5 pr-1.5 align-middle">
                {row.isCurrent && (
                  <span
                    className="block h-1.5 w-1.5 rounded-full bg-emerald-500"
                    title={row.currentTitle}
                  />
                )}
              </td>
              <td className="py-1.5 pr-3 align-middle">
                <Link href={row.href} className="link-accent">
                  {row.name}
                </Link>
              </td>
              <td className="w-px py-1.5 pr-3 align-middle whitespace-nowrap">
                <PartyBadge party={row.party} />
              </td>
              <td className="py-1.5 text-right align-middle whitespace-nowrap font-mono text-muted">
                {row.startDate} – {row.endDate}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Senate/Governor history is long but not district-splittable (Senate has
// no stable per-seat id in the schema, Governor has only one seat) — a
// simple "most recent N, expand for the rest" cap is enough for these two,
// unlike House below which needs actual grouping. Rows arrive newest-first
// (getSenateHistory/getGovernorHistory), so the cap naturally shows the
// most recent officeholders by default.
const HISTORY_CAP = 15;

function CappedHistorySection({
  title,
  rows,
  emptyMessage,
}: {
  title: string;
  rows: HistoryRow[];
  emptyMessage: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleRows = expanded ? rows : rows.slice(0, HISTORY_CAP);

  return (
    <Section title={title}>
      {rows.length > 0 ? (
        <>
          <HistoryTable rows={visibleRows} />
          {rows.length > HISTORY_CAP && (
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="mt-2 text-xs font-medium text-seal hover:underline"
            >
              {expanded ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      ) : (
        <Empty>{emptyMessage}</Empty>
      )}
    </Section>
  );
}

// -1 is a real congress-legislators convention, not missing data: before the
// 1967 Apportionment Act required single-member districts, some states
// elected multiple reps statewide on one "general ticket" — distinct from 0,
// which means a single at-large seat. Confirmed live: CA has 22 such
// pre-1852 terms. The plain `district === 0` check used elsewhere in the app
// (legislator/[id]/page.tsx, RepresentativesList.tsx, race pages) never hits
// this case — races/current-terms are all modern, single-member districts —
// but grouping surfaces it as its own labeled bucket instead of one
// inline cell, so it needs its own label here.
function districtLabel(district: number): string {
  if (district === 0) return "At-large";
  if (district === -1) return "At-large (multi-member)";
  return `District ${district}`;
}

// Collapsed by default, same interaction as HouseRacesByState.tsx's
// per-state rows on /midterms-2026 — an already-established convention for
// "there are too many House rows to show flat, group and let the user
// expand what they care about."
function DistrictHistoryGroup({
  district,
  rows,
}: {
  district: number;
  rows: HistoryRow[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-rule last:border-0">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm"
        aria-expanded={isOpen}
      >
        <span className="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`h-3 w-3 shrink-0 text-muted transition-transform duration-150 ${isOpen ? "rotate-90" : ""}`}
            aria-hidden="true"
          >
            <path d="M9 6l6 6-6 6" />
          </svg>
          {districtLabel(district)}
        </span>
        <span className="text-muted">
          {rows.length} term{rows.length === 1 ? "" : "s"}
        </span>
      </button>
      {isOpen && (
        <div className="pb-2 pl-5">
          <HistoryTable rows={rows} />
        </div>
      )}
    </div>
  );
}

// District lines have been redrawn many times since 1789 (see
// getHouseHistory's own comment) — grouping by district_number is purely an
// organizational convenience for browsing, not a claim that "District 12"
// names one continuous seat across the whole list.
function HouseHistoryByDistrict({ rows }: { rows: (HistoryRow & { district: number })[] }) {
  const groups = new Map<number, HistoryRow[]>();
  for (const row of rows) {
    const group = groups.get(row.district);
    if (group) group.push(row);
    else groups.set(row.district, [row]);
  }
  const sortedDistricts = [...groups.keys()].sort((a, b) => a - b);

  return (
    <div>
      {sortedDistricts.map((district) => (
        <DistrictHistoryGroup key={district} district={district} rows={groups.get(district)!} />
      ))}
    </div>
  );
}

function HistoryTab({ senateHistory, houseHistory, governorHistory }: StateTabsProps) {
  const houseRows = houseHistory.map(houseRow);

  return (
    <div className="flex flex-col gap-6">
      <CappedHistorySection
        title="Senators over time"
        rows={senateHistory.map(senateRow)}
        emptyMessage="No Senate history data."
      />

      <Section title="Representatives over time">
        {houseRows.length > 0 ? (
          <>
            <p className="mb-2 text-xs text-muted">
              Grouped by district — district lines have been redrawn many times since 1789, so a
              district number here doesn&apos;t represent one continuous seat.
            </p>
            <HouseHistoryByDistrict rows={houseRows} />
          </>
        ) : (
          <Empty>No House history data.</Empty>
        )}
      </Section>

      <CappedHistorySection
        title="Governors over time"
        rows={governorHistory.map(governorRow)}
        emptyMessage="No governor history data."
      />
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

const OFFICE_ORDER: Record<Race["office"], number> = { senate: 0, governor: 1, house: 2 };

// A House race's section title needs the district too — unlike Senate/Governor
// (one race per state, "U.S. Senate" alone is unambiguous), a state can have
// dozens of House races and every one would otherwise render as an
// indistinguishable "U.S. House" section.
function raceSectionTitle(race: Race): string {
  if (race.office !== "house") return OFFICE_LABELS[race.office];
  const district = race.districtNumber === 0 ? "At-large" : `District ${race.districtNumber}`;
  return `${OFFICE_LABELS.house} — ${district}`;
}

function MidtermsTab({ races }: StateTabsProps) {
  const sortedRaces = [...races].sort((a, b) => {
    const officeDiff = OFFICE_ORDER[a.office] - OFFICE_ORDER[b.office];
    if (officeDiff !== 0) return officeDiff;
    return (a.districtNumber ?? 0) - (b.districtNumber ?? 0);
  });

  return (
    <div className="flex flex-col gap-6">
      {sortedRaces.length > 0 ? (
        sortedRaces.map((race) => {
          const pendingMessage = primaryPendingMessage(race);
          return (
            <Section key={race.id} title={raceSectionTitle(race)}>
              <p className="mb-1 flex items-center gap-1.5 text-xs text-muted">
                {race.status !== "called" && (
                  <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
                )}
                {race.status === "called" ? "Called" : "Not yet decided"}
              </p>
              {pendingMessage ? (
                <Empty>{pendingMessage}</Empty>
              ) : (
                <ul className="flex flex-col gap-1">
                  {race.candidates.map((candidate) => (
                    <li key={candidate.id}>
                      {candidate.name} <PartyBadge party={candidate.party} />
                      {candidate.isIncumbent && <span className="text-muted"> (incumbent)</span>}
                      {candidate.id === race.winnerCandidateId && (
                        <span className="text-muted"> — winner</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          );
        })
      ) : (
        <Section title="2026 Midterms">
          <Empty>No race data for this state this cycle.</Empty>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="border-b border-rule pb-1">
        <SectionHeading as="h3">{title}</SectionHeading>
      </div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
