"use client";

import { useState } from "react";
import { UsMap } from "@/components/UsMap";
import { StatePanel } from "@/components/StatePanel";

export default function Home() {
  const [selectedAbbr, setSelectedAbbr] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(null);

  function handleSelectState(abbr: string | null, district: number | null = null) {
    setSelectedAbbr(abbr);
    setSelectedDistrict(district);
  }

  return (
    <div className="flex h-dvh flex-col sm:flex-row">
      <div className="relative min-h-0 flex-1">
        <UsMap selectedAbbr={selectedAbbr} onSelectState={handleSelectState} />
      </div>
      <aside className="w-full max-h-[45vh] overflow-y-auto border-t border-zinc-200 sm:max-h-none sm:w-80 sm:border-l sm:border-t-0 dark:border-zinc-800">
        <StatePanel
          abbr={selectedAbbr}
          selectedDistrict={selectedDistrict}
          onClose={() => handleSelectState(null)}
        />
      </aside>
    </div>
  );
}
