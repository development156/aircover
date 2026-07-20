# SAHODA LABS — AI Marketing OS

Docs are law: /docs 00_README → canon order. Sprint = docs/05 (2-day Alpha). Behavior = 02_FSD. Architecture = 03_TSD. Tokens/components = 08_Design_System (no raw hex anywhere). Demos sahoda_dashboard_demo.html + sahoda_brand_brain_demo.html = canonical UI reference.

## Stack

pnpm+Turborepo · apps/web Next.js 15 App Router+TS+Tailwind+shadcn · apps/jobs Trigger.dev · packages: db(Supabase+RLS+pgvector) shared(zod SOURCE OF TRUTH) mesh publishing billing render · Clerk · Upstash · Cloudflare(sites) · Resend · Sentry.

## Commands

pnpm install · pnpm dev · turbo typecheck lint test · supabase migration new <name> (db push = ASK) · pnpm test:smoke

## Non-negotiables

- Types/schemas import from packages/shared only — never redefine.
- Every table: workspace_id + RLS + anon-client test (skill: sahoda-db). Ledger only via apply_ledger_entry (skill: sahoda-ledger); users never pay for failures.
- All model calls via packages/mesh server-side (skill: sahoda-mesh); zod-parse outputs; no mock-success in prod paths — honest "pending" flags instead.
- OAuth tokens: AES vault, decrypt in memory, never log/return.
- Credit prices from pricing.config.json only. Costs shown before spend.
- UI: tokens only, all states, verb-first sentence-case copy, tabular-nums for numbers (skill: sahoda-ui).
- Small files (<300 lines), one adapter per file, plan mode for >1-file work, tests-first for ledger/RLS/adapters.

## Do NOT touch

.env*, secrets/, applied migrations, pnpm-lock.yaml by hand, prod resources. Only wt-db edits packages/db/supabase/migrations.

## Loop

/worktree-kickoff at session start · /plan-feature before building · /review then /ship to finish · one LEARNINGS.md line per PR; recurring rules get promoted into the relevant CLAUDE.md.

## Team bug-fix sessions (Claude Code on the web)

Rules for teammates fixing bugs in cloud sessions at claude.ai/code. Type `/fix <issue number>` to start. Full walkthrough: docs/TEAM_ONBOARDING.md. In these sessions `/fix` replaces the Loop above — no worktree-kickoff, no /ship.

- **Bug fixes only**, against an assigned GitHub issue. No new features, no refactors, no dependency changes.
- **Never modify:** `packages/shared` (frozen contracts), `packages/db/supabase/migrations` (applied migrations are immutable), anything matching `.env*`, `pricing.config.json`, `.github`, `.claude/settings.json`.
- **Never push to main.** Always work on a branch and open a pull request. Never merge your own pull request.
- **Reproduce the bug with a failing test first.** Then fix it, then confirm that same test passes.
- **Agents:** use `reviewer` (on the diff, before opening the PR), `test-writer`, and `debug-agent`. Do NOT use `db-migration-agent`, `sites-agent`, or any agent that writes migrations.
- **The cloud sandbox has no `.env`.** Live-database tests skip automatically and the app cannot be run locally — that is normal, not something to fix. Visual checks happen on the Vercel preview URL that builds automatically for the PR.
- **If the fix would need a schema change, a shared-contract change, or another package's internals: STOP.** Say exactly that in the PR description instead of doing it.
