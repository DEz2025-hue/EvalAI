# EvalAI Repository Audit — 2026-10-28

**Status:** Completed — Phase 0 greenfield audit
**Date:** 2026-10-28
**Repository/branch:** C:\Users\CollinsMichael\eval-ai (no .git yet)
**Auditor:** Muse Code (automated)
**Environment:** Windows, Node v22.13.0, npm 8.19.2, pnpm 12.15.0 (via local prefix), git 2.45.1
**Commands run:**
- `Get-ChildItem -Force C:\Users\CollinsMichael\eval-ai` — listed 6 entries
- `git -C C:\Users\CollinsMichael\eval-ai status` — fatal: not a git repository
- `node -v / npm -v / pnpm -v` — verified toolchain (pnpm requires --dir workaround due to home dir canonicalization EPERM)

## 2. Repository inventory

**Root:** `C:\Users\CollinsMichael\eval-ai` — contains only `eval-ai md/` docs folder + dot dirs `.agents/.eden/.hg/.claude/.sl`. No `package.json`, no lockfile, no `src/`, `apps/`, `packages/`, no migrations, no tests, no CI.

**Docs present (15 files in `eval-ai md/`):** AGENTS.md, AI_AND_VOICE.md, ARCHITECTURE.md, DATA_MODEL.md, DECISIONS.md, ENVIRONMENT_AND_SECRETS.md, FEATURE_STATUS.md, IMPLEMENTATION_PLAN.md, INDEX.md, PRODUCT_REQUIREMENTS.md, README.md, REPOSITORY_AUDIT.md (template), SCREEN_SPECIFICATIONS.md, SECURITY.md, TEST_PLAN.md, WORKFLOWS.md.

**Confirmed empty:** No web entry point, no mobile entry point, no routing, no components, no domain layer, no Supabase config, no storage, no AI adapter, no report generation, no auth, no tests.

## 3. Baseline checks

| Check | Command | Result | Notes |
|-------|---------|--------|-------|
| Install/dependency state | `pnpm --dir . -v` / `npm -v` | No manifest — nothing to install | Greenfield |
| Lint | — | Not run — no config | To add eslint |
| Type check | — | Not run — no tsconfig | To add |
| Unit tests | — | Not run — no tests | To add |
| Integration tests | — | Not run | To add |
| Build | — | Not run | To add |

## 4. Feature inventory

All features: **Not implemented — no code to cite.** No authentication, workspaces, Assessment/Inspection modes, Solar/CCTV packs, checklist editing, evidence/photo upload, voice, AI adapter, measurements/calculations, findings, materials, quotations, reports, offline/draft recovery, authorization/audit events.

Evidence: directory listing above; confirmed via `Get-ChildItem -Recurse -File -Exclude *.md` returned zero files.

## 5. Security review

No client bundles, no env files, no secrets exposure — nothing to expose. No private storage, no signed URLs, no DB policies to weaken. Safe to scaffold with security-first defaults: server-only secrets, RLS deny-by-default, private storage.

## 6. Findings

| ID | Severity | Finding | Evidence | Recommended action | Owner/status |
|----|----------|---------|----------|--------------------|--------------|
| A-001 | Medium | No git repository — no version control | `git status` fatal | `git init`, initial commit with docs + scaffold | Open — next step |
| A-002 | High | No pnpm global — EPERM on `C:\Users\CollinsMichael\.npm-global` and npm-cache tmp | npm EPERM logs, pnpm canonicalize error | Use local pnpm prefix `.\.tmp-prefix\node_modules\pnpm\pnpm.exe --dir .` or fix ACLs; prefer `pnpm` via that prefix for now | Open |
| A-003 | Info | Empty greenfield — documented stack now decided but not scaffolded | Q1-Q3 decisions 2026-10-28 | Scaffold pnpm monorepo per D-011 | Open |

## 7. Architecture decisions

- Current: none (empty).
- Proposed: pnpm monorepo `apps/web` (Next.js + TS) + `apps/mobile` (Expo + TS) + `packages/shared` + `packages/ai-adapter` + Supabase (Postgres, Auth, private Storage, RLS) + Vercel hosting + Meta AI server adapter (Wonder/Spark/Voice Transcribe). See DECISIONS.md D-011..D-013.
- Migration impact: none (greenfield).
- Security: enforce RLS, private storage, server-only `AI_PROVIDER_API_KEY`.

## 8. Conclusion

- What works today: Documentation pack only; no runnable app.
- What is incomplete: Everything (Phases 1-8).
- What is unsafe/fragile: pnpm global install EPERM — workaround documented.
- What can be reused: Docs as source of truth; no code to reuse.
- Safest next phase: Phase 1 security/foundation + Phase 2 Solar assessment vertical slice, as per Q2.
- Blockers: Need Supabase project creds + Meta API keys to verify Wonder/Spark/Voice Transcribe & SAM 3.1 live; until then label fallback clearly per D-013. Need to `git init`.

Copy of this audit is also written to repo root as `REPOSITORY_AUDIT.md` for scaffold reference; source template in `eval-ai md/REPOSITORY_AUDIT.md` remains.
