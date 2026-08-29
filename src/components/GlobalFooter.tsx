import { getGlobalFreshness } from "@/lib/sync-freshness";
import { SyncFreshnessNote } from "./SyncFreshnessNote";

// Dropped into every top-level page except the home map (/), which is a
// deliberately chrome-free h-dvh fullscreen layout — see layout.tsx's own
// comment on why it can't live in RootLayout instead.
export async function GlobalFooter() {
  const syncedAt = await getGlobalFreshness();
  return (
    <footer className="py-6 text-center">
      <SyncFreshnessNote label="Data" syncedAt={syncedAt} />
    </footer>
  );
}
