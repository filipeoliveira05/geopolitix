"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { UsMap } from "@/components/UsMap";
import { StatePanel } from "@/components/StatePanel";

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlState = searchParams.get("state");

  const [selectedAbbr, setSelectedAbbr] = useState<string | null>(urlState);
  const [selectedDistrict, setSelectedDistrict] = useState<number | null>(null);

  function handleSelectState(abbr: string | null, district: number | null = null) {
    setSelectedAbbr(abbr);
    setSelectedDistrict(district);
  }

  // Mirror the selected state into the URL (replace, not push) so the native
  // back button restores the panel instead of landing on a blank map — but
  // without adding extra entries to the back stack for every map click.
  useEffect(() => {
    const query = selectedAbbr ? `?state=${selectedAbbr}` : "";
    router.replace(`/${query}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAbbr]);

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

export default function Home() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}
