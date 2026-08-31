# Geopolitix

An educational app for the US political system (House, Senate, Governors, Congress history)
and US geography, built on the back of the 2026 midterms.

See [`CLAUDE.md`](./CLAUDE.md) for operating conventions and current build state, and
[`geopolitix-app-plan.md`](./geopolitix-app-plan.md) for the full project plan (goals, data
sources, schema, sync strategy, page flow, roadmap).

## Tech stack

- Next.js (App Router) + Tailwind CSS
- Supabase (Postgres) — the app always reads from Supabase, never calls external APIs directly
- MapLibre GL JS
- TanStack Query
- Installable as a PWA ("Add to Home Screen")

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see it. You'll need Supabase
credentials in a gitignored `.env.local` — see `geopolitix-app-plan.md` §7 for the required
env vars.

## Syncing data

The app never calls external APIs from the browser — everything it reads lives in Supabase,
populated by the scripts in `scripts/sync/`:

```bash
npm run sync:states              # minimal state seed — run first (FK dependency)
npm run sync:legislators         # current + historical House/Senate terms
npm run sync:governors           # current governors (needs OPENSTATES_API_KEY)
npm run sync:governor-history    # full governor history back to statehood
npm run sync:races               # 2026 Senate/Governor/House races
npm run sync:districts           # House district boundaries (metadata + geometry)
```

These also run on a schedule via GitHub Actions — see `.github/workflows/`.

## Learn more

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
