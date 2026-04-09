# GreedierArena

Self-managed Vite + React + Supabase project.

## Local development

Prerequisites:

- Node.js 20+
- npm (or Bun)

1. Install dependencies:

```sh
npm install
```

2. Create `.env.local`:

```sh
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

3. Start dev server:

```sh
npm run dev
```

## Supabase ownership

This repository includes SQL migrations in `supabase/migrations`.

- Keep existing migration files as the source of truth.
- Apply them to your own Supabase project using Supabase CLI.
- Do not run migration commands against any third-party/legacy Supabase project unless intended.

Typical workflow:

```sh
# Link CLI to your own project (once)
supabase link --project-ref YOUR_PROJECT_REF

# Apply local migrations to linked project
supabase db push
```

## Deploy to Vercel

1. Import this repo into Vercel.
2. Framework preset: Vite.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add environment variables in Vercel project settings:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`

## Scripts

- `npm run dev` - start local dev server
- `npm run build` - production build
- `npm run preview` - preview production build
- `npm run test` - run tests

