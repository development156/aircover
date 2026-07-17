# SAHODA LABS — AI Marketing OS
Docs are law: /docs 00_README → canon order. Sprint = docs/05 (2-day Alpha). Behavior = 02_FSD. Architecture = 03_TSD. Tokens/components = 08_Design_System (no raw hex anywhere). Demos sahoda_dashboard_demo.html + sahoda_brand_brain_demo.html = canonical UI reference.

## Stack
pnpm+Turborepo · apps/web Next.js 15 App Router+TS+Tailwind+shadcn · apps/jobs Trigger.dev · packages: db(Supabase+RLS+pgvector) shared(zod SOURCE OF TRUTH) mesh publishing billing render · Clerk · Upstash · Cloudflare(sites) · Resend · Sentry.

## Commands
pnpm install · pnpm dev · turbo typecheck lint test · supabase migration new <name> (db push = ASK) · pnpm playwright test --grep @smoke

## Non-negotiables
- Types/schemas import from packages/shared only — never redefine.
- Every table: workspace_id + RLS + anon-client test (skill: sahoda-db). Ledger only via apply_ledger_entry (skill: sahoda-ledger); users never pay for failures.
- All model calls via packages/mesh server-side (skill: sahoda-mesh); zod-parse outputs; no mock-success in prod paths — honest "pending" flags instead.
- OAuth tokens: AES vault, decrypt in memory, never log/return.
- Credit prices from pricing.config.json only. Costs shown before spend.
- UI: tokens only, all states, verb-first sentence-case copy, tabular-nums for numbers (skill: sahoda-ui).
- Small files (<300 lines), one adapter per file, plan mode for >1-file work, tests-first for ledger/RLS/adapters.

## Do NOT touch
.env*, secrets/, applied migrations, pnpm-lock.yaml by hand, prod resources. Only wt-db edits packages/db/migrations.

## Loop
/worktree-kickoff at session start · /plan-feature before building · /review then /ship to finish · one LEARNINGS.md line per PR; recurring rules get promoted into the relevant CLAUDE.md.
