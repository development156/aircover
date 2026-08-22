# SAHODA LABS — AI Marketing OS

Docs are law: /docs 00_README → canon order. Sprint = docs/05 (2-day Alpha). Behavior = 02_FSD. Architecture = 03_TSD. Tokens/components = 08_Design_System (no raw hex anywhere). Demos sahoda_dashboard_demo.html + sahoda_brand_brain_demo.html = canonical UI reference.

UI work: read docs/design2.0/UI_RULES_v3.md first.

## Stack

pnpm+Turborepo · apps/web Next.js 15 App Router+TS+Tailwind+shadcn · apps/jobs Trigger.dev · packages: db(Supabase+RLS+pgvector) shared(zod SOURCE OF TRUTH) mesh publishing billing render · Clerk · Upstash · Cloudflare(sites) · Resend · Sentry.

## Commands

pnpm install · pnpm dev · **the gate = `pnpm gate`** · supabase migration new <name> (db push = ASK)

`pnpm gate` = `turbo run typecheck lint test && turbo run test:smoke && prettier --check .` — one command, because the two halves that used to sit outside it were both silently red for months. `format:check` is a ROOT script outside turbo, so a green turbo count says nothing about formatting. And `turbo test` runs VITEST ONLY: the Playwright suite sat outside the gate for twenty runs while `golden-path` was failing the whole time, because a product change turned "Create post" from a `<button>` into a `<Link>` and nothing was watching. MEASURED 2026-08-22 on `wt-integrate2`, after thirteen lanes merged: `playwright test --list` reports **209 tests in 50 files** and `--grep @smoke` reports **102 tests in 28 files**. The gate's smoke leg ran all 102 and reported **102 passed, none skipped**. (It read 76/19 and 67 on 2026-08-20, then 102/32 and 91 earlier on 2026-08-22 — the figure this sentence carried until now, and wrong in both halves by the time it was read. wt-playbooks, wt-knowledge, wt-webhooks, wt-media, wt-radar, wt-radar-ui and wt-remix each brought specs; six routes were added to `no-impossible-remedy` at integration, and `roadmap-honesty` gained a guard that asserts its OWN header count for exactly this reason.) The 107 outside the tag are deliberate and each says why in its own header — `assets.spec.ts` uploads real bytes to storage, `design-audit.spec.ts` is a screenshot tool, `onboarding-build.spec.ts` and `onboarding-money-guard.spec.ts` each drive eight screens and mint a Clerk user. The gate runs the 102, not "every one of them". **A stale number here is the same defect as a stale number on a screen** — re-measure it in the same commit that moves it.

`pnpm gate` needs `apps/web/.env.local` (Clerk keys) for the e2e half; without it `e2e/global-setup.ts` throws with the missing names.

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

## Copy style

User-facing copy follows `.agents/skills/humanizer` (33 patterns, from Wikipedia's "Signs of AI writing"). Three standing rulings, so nobody re-litigates them:

- **Em dashes stay.** §14 bans them outright, but the reference design uses 542 and this app 355, and the skill's own Voice Calibration says a writing sample outranks §14. Matching the house voice beats scrubbing the tell. Never run a bulk em-dash strip.
- **Sahoda speaks in the third person.** "Sahoda could not reach your accounts", never "I could not". 44 third-person mentions set the voice; the two first-person strays were fixed 2026-08-16.
- **Curly quotes around user content are correct typography**, not a tell — §19's own false-positive clause. `Delete "{title}" for good?` keeps them.

The mechanical patterns (AI vocabulary, filler, signposting, servility, emoji, rule-of-three) audit clean and have stayed clean. What actually gets caught here is implementation jargon leaking into user-facing bodies — "the response carried no per-account status" describes our payload, not the reader's situation — plus subjectless fragments and garden-path sentences.

Empty states and errors state the CLAIM precisely: "we never asked" and "we asked and got nothing" are different sentences, and `lib/inbox/emptiness.ts` exists to keep eight of them apart. Its tests assert the claim (`not a reading of your reviews`, `nothing was charged`) and the forbidden claim (`not.toMatch(/\bno reviews\b/)`), never the wording — so rewrite the sentence freely and keep the guarantee.
