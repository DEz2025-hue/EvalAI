# EvalAI

Site-assessment and inspection platform — Solar and CCTV workflow packs, shared core engine.

**Stack:** pnpm monorepo — Next.js (web) + Expo (mobile) + Supabase (Postgres, Auth, private Storage, RLS) + Vercel + Meta Model API (Wonder / Spark / Voice Transcribe / SAM 3.1) via server-side adapter.

**Docs:** See [`eval-ai md/`](eval-ai%20md/README.md) — source of truth for product, architecture, security, AI/voice, data model, screens, and implementation plan.

## Quick start

```bash
# prerequisites: Node >=18
# pnpm via local prefix workaround if global EPERM:
# npm --prefix .tmp-prefix install pnpm  (already done once)
# then use:
# .\.tmp-prefix\node_modules\pnpm\pnpm.exe --dir . install
# or after fixing ACLs: pnpm install

pnpm install
cp .env.example .env.local   # fill real values — never commit .env.local
pnpm dev:web                 # http://localhost:3000
pnpm dev:mobile              # expo start
```

## Structure

```
eval-ai/
  apps/web          # Next.js + TypeScript
  apps/mobile       # Expo React Native + TypeScript
  packages/shared   # domain, calculations, types
  packages/ai-adapter # server-side Meta adapter
  packages/supabase # supabase client + migrations
  supabase/         # SQL migrations, RLS
  eval-ai md/       # product docs (source of truth)
```

## Security

- Secrets are server-only (`AI_PROVIDER_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, etc.) — never `NEXT_PUBLIC_` / `EXPO_PUBLIC_`.
- RLS deny-by-default, private Storage with short-lived signed URLs.
- See `eval-ai md/SECURITY.md` and `eval-ai md/ENVIRONMENT_AND_SECRETS.md`.

## Decisions

See `eval-ai md/DECISIONS.md` — D-011 (stack), D-012 (first build), D-013 (Meta models).

## Reports

PDF + HTML preview from versioned snapshots — later edits never mutate finalized reports.
