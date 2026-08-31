"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UsMap } from "@/components/UsMap";
import { StatePanel } from "@/components/StatePanel";
import { parseElectionYearParam, type ElectionYear } from "@/lib/election-years";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = searchParams.get("state");
  const urlYear = searchParams.get("year");

  const [selectedAbbr, setSelectedAbbr] = useState<string | null>(urlState);
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(null);
  // Lifted here (not owned by UsMap) so the side panel can also switch to
  // the same year's senators/reps when a state is selected — see
  // election-years.ts. Initialized from the URL the same way `selectedAbbr`
  // already is, so a shared/reloaded link preserves the selected year too.
  const [year, setYear] = useState<ElectionYear>(() => parseElectionYearParam(urlYear));

  function handleSelectState(abbr: string | null, district: number | null = null) {
    setSelectedAbbr(abbr);
    setSelectedDistrict(district);
  }

  // Mirror the selected state and year into the URL (replace, not push) so
  // the native back button restores the panel instead of landing on a blank
  // map — but without adding extra entries to the back stack for every map
  // click. `year` is omitted entirely when "current" (the default), so an
  // ordinary visit still gets a bare `/`.
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedAbbr) params.set("state", selectedAbbr);
    if (year !== "current") params.set("year", String(year));
    const query = params.size > 0 ? `?${params.toString()}` : "";
    router.replace(`/${query}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAbbr, year]);

  return (
    <div className="flex h-dvh flex-col sm:flex-row">
      <div className="relative min-h-0 flex-1">
        <UsMap
          selectedAbbr={selectedAbbr}
          onSelectState={handleSelectState}
          year={year}
          onChangeYear={setYear}
        />
      </div>
      {/* sm:pt-14 — on desktop this sidebar spans the full h-dvh height
          alongside the map, so its top content would otherwise sit under
          GlobalHeader's fixed overlay (h-14); on mobile it's stacked below
          the map, already clear of the header. */}
      <aside className="w-full max-h-[45vh] overflow-y-auto border-t border-rule bg-surface sm:max-h-none sm:w-80 sm:border-l sm:border-t-0 sm:pt-14">
        <StatePanel
          abbr={selectedAbbr}
          selectedDistrict={selectedDistrict}
          onClose={() => handleSelectState(null)}
          year={year}
        />
      </aside>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
