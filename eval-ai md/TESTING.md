# Testing

| Layer | Where | What it proves | Run |
|---|---|---|---|
| Unit / integration | `packages/*/src/__tests__`, `apps/web/lib/__tests__` | Shared rules, AI adapter, store guards, uploads, audio, reports | `pnpm -r test` |
| Row-level security | `supabase/tests/rls.test.sql` | The database itself enforces tenant isolation and roles, whatever the app code does | `pnpm test:rls` (needs `DATABASE_URL`) |
| Browser end-to-end | `e2e/*.spec.ts` | The core workflow works in a real browser, and failure paths fail safely | `pnpm test:e2e` |

## Row-level security suite

Plain SQL, no extensions. It runs in **one transaction that is rolled back**, so it is safe against any database, including the live project:

1. Seeds throw-away users, two workspaces and one row in every table.
2. Impersonates each actor exactly as PostgREST does (`request.jwt.claims` + `SET ROLE`): anonymous, signed-in outsider, signed-in stranger with no workspace, viewer, member, admin, owner.
3. Records pass/fail per assertion and prints totals plus the names of failures.

Covered: every table is invisible to outsiders and anonymous callers; viewers are read-only; members can work but cannot delete sites, assessments or drafts, manage members or touch the workspace; admins can delete and manage non-owners but cannot create, demote, remove or become owners; owners can; members can leave; `audit_events` and `ai_runs` cannot be written by any client; cross-tenant and cross-assessment references are refused (evidence, materials, quotations, measurements, checklist responses, snapshots); workspace bootstrap rules; the `replace_checklist` and `save_materials_list` functions refuse outsiders and viewers; snapshot versions are allocated by the server; sign-off needs a reviewer; finalized reports are immutable; data-quality constraints; RLS is enabled on every public table and no policy is a blanket `true`.

Against a local Supabase stack (what CI does):

```bash
supabase init && supabase start
PGOPTIONS="-c rls_test.strict=on" psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/tests/rls.test.sql
```

`rls_test.strict=on` makes the run fail (non-zero exit) when anything fails; without it the failures are only listed in the last result set. Against the hosted project, paste the file into the SQL editor (or use any SQL client). The last result is `{passed, failed, failures}`; `failed` must be 0.

**Add a test whenever you add a table or policy.** A new table needs a row in the seed block, a line in `read_all`, and write checks for each role.

Last run against the live project (migrations 0001–0013): 263 passed, 0 failed, nothing left behind.

## Browser end-to-end suite

Playwright runs the app in **demo mode** (file-backed store, no Supabase, no AI key), so it is deterministic, free and needs no secrets. `playwright.config.ts` starts the server itself, blanks the Supabase and AI environment variables so `.env.local` cannot leak in, and `e2e/global-setup.ts` empties `apps/web/.tmp-data` before each run.

- `smoke.spec.ts` — every main screen renders without a page error.
- `workflow.spec.ts` — create job → checklist walkthrough → finding → measurement → completeness → materials and quotation → report draft → edit → sign-off → locked, PDF export, and "facts changed after the draft" blocks sign-off.
- `guards.spec.ts` — invalid input is rejected, unknown ids are 404, sign-off needs explicit confirmation, AI says it is unavailable instead of inventing content.

Locally the system Microsoft Edge is used (no browser download). CI installs Chromium (`E2E_CHANNEL` empty) and tests the production build:

```bash
pnpm test:e2e                       # dev server, Edge
E2E_SERVER_COMMAND="node node_modules/next/dist/bin/next start -p 3100" pnpm test:e2e   # after `pnpm --filter web build`
```

Build the web app **without** Supabase variables when testing the production build locally (`NEXT_PUBLIC_*` values are baked in at build time and would turn demo mode off).

What E2E deliberately does not cover: Supabase-backed mode (the RLS suite covers the database half), real AI calls (billing is not set up; see `AI_AND_VOICE.md` §10), the mobile app, and live camera (Coming Soon).

## Bugs these suites have found

- Checklist walkthrough: a slow or duplicated load (React StrictMode double-run, quick navigation) could overwrite answers already entered, so choosing "Pass" and then typing a note saved "Not Checked". Fixed with a cancel guard in `ChecklistWalkthrough`.
