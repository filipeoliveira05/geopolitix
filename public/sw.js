// Minimal service worker — exists only to satisfy the browser's PWA
// installability check (Chrome requires a registered service worker with a
// fetch handler). Deliberately does no caching: this app always reads live
// data from Supabase (see CLAUDE.md non-goals), so an offline app shell
// would show stale/broken data rather than anything useful.
self.addEventListener("fetch", () => {});
