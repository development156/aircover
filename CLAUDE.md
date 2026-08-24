# SAHODA LABS — AI Marketing OS

Docs are law: /docs 00_README → canon order. Sprint = docs/05 (2-day Alpha). Behavior = 02_FSD. Architecture = 03_TSD. **Tokens/components = docs/37_Design_System_v5.md** (no raw hex anywhere).

**Design canon, in order — read the top one, not the others.** The chain is
`08 → 26 → 37` and each states its own supersession in its header:

| File                                   | Status                      | Its own header says                                                                                                                              |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `docs/37_Design_System_v5.md`          | **CANON — build from this** | "Status: canon. Supersedes 26, which supersedes 08 and `docs/ui-package/sahoda-labs/`. If any of those disagree with this file, this file wins." |
| `docs/26_Design_System_v4.md`          | superseded                  | "SUPERSEDED by `docs/37`. **Do not build from this file.**"                                                                                      |
| `docs/08_Design_System_SAHODA_LABS.md` | superseded (v1.0)           | still claims "this file wins for any token or component value" — it does not                                                                     |
| `docs/design2.0/UI_RULES_v3.md`        | superseded                  | points back at 08 "for governance" — it does not govern                                                                                          |

The two demo HTMLs (`sahoda_dashboard_demo.html`, `sahoda_brand_brain_demo.html`)
illustrate the v1.0 system and are **not** a reference for new work.

Tokens live in `packages/shared/tokens.css`. Editing that file requires
regenerating the inline copy: `node scripts/gen-tokens-inline.mjs`.

## Stack

pnpm+Turborepo · apps/web Next.js 15 App Router+TS+Tailwind+shadcn · apps/jobs Trigger.dev · packages: db(Supabase+RLS+pgvector) shared(zod SOURCE OF TRUTH) mesh publishing billing render · Clerk · Upstash · Cloudflare(sites) · Resend · Sentry.

## Commands

pnpm install · pnpm dev · **the gate = `pnpm gate`** · supabase migration new <name> (db push = ASK)

`pnpm gate` = `turbo run typecheck lint test && turbo run test:smoke && prettier --check .` — one command, because the two halves that used to sit outside it were both silently red for months. `format:check` is a ROOT script outside turbo, so a green turbo count says nothing about formatting. And `turbo test` runs VITEST ONLY: the Playwright suite sat outside the gate for twenty runs while `golden-path` was failing the whole time, because a product change turned "Create post" from a `<button>` into a `<Link>` and nothing was watching. MEASURED 2026-08-24 on `wt-release`, the six-lane integration: `playwright test --list` reports **274 tests in 70 files** and `--grep @smoke` reports **115 tests in 35 files**. The gate's smoke leg ran all 115 and reported **115 passed, none skipped** (15.6m). (It read **229 / 110 in 60 / 32 files** on 2026-08-23 on `wt-page-rest`, the figure this sentence carried until now; the five new @smoke tests are wt-boot's, wt-infra's, and `accent-area-budget` ×1 — which exists because wt-dash2 and wt-page-rest independently wrote DIFFERENT guards into the same filename and the merge kept both.) (It read **209 / 102 in 50 / 28 files** on 2026-08-22 on `wt-integrate2`, the figure this sentence carried until now; the eight new @smoke tests are this lane's `auth-contrast` ×4, `auth-already-signed-in` ×2, `accent-budget` ×1 and `roadmap-figures-scan` ×1. This figure moved TWICE inside this lane — it was re-measured at 109 and a ninth spec landed after — which is the drift this sentence exists to catch, caught on itself.) (It read 76/19 and 67 on 2026-08-20, then 102/32 and 91 earlier on 2026-08-22 — the figure this sentence carried until now, and wrong in both halves by the time it was read. wt-playbooks, wt-knowledge, wt-webhooks, wt-media, wt-radar, wt-radar-ui and wt-remix each brought specs; six routes were added to `no-impossible-remedy` at integration, and `roadmap-honesty` gained a guard that asserts its OWN header count for exactly this reason.) The 159 outside the tag are deliberate and each says why in its own header — `assets.spec.ts` uploads real bytes to storage, `design-audit.spec.ts` is a screenshot tool, `onboarding-build.spec.ts` and `onboarding-money-guard.spec.ts` each drive eight screens and mint a Clerk user. The gate runs the 115, not "every one of them". **A stale number here is the same defect as a stale number on a screen** — re-measure it in the same commit that moves it.

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
- **The cloud sandbox now GETS a `.env`**, written by `scripts/cloud-setup.sh` from environment variables set on the cloud environment. Changed 2026-08-24; this line previously said the sandbox has none by design. If the script reports a REQUIRED variable absent, that is a settings problem to report, **not** a reason to invent a value or to un-skip a test that skipped for want of it — a suite that ran nothing reports as passing, which is how twenty-six billing tests never executed for months. Visual checks still happen on the Vercel preview URL that builds automatically for the branch.
- **If the fix would need a schema change, a shared-contract change, or another package's internals: STOP.** Say exactly that in the PR description instead of doing it.

## Copy style

User-facing copy follows `.agents/skills/humanizer` (33 patterns, from Wikipedia's "Signs of AI writing"). Standing rulings, so nobody re-litigates them:

- **The em dash and the en dash leave user-facing PROSE.** Founder's ruling, 2026-08-23, reversing the earlier "em dashes stay" that cited the reference design's 542 uses. 650 dashes were rewritten across 290 files. Rewrite the sentence: a full stop where the dash joined two independent clauses, a comma where it fenced a genuine aside, a colon where it introduced a list or a value, parentheses where two dashes bracketed one. Swapping the glyph for a comma and leaving the sentence otherwise untouched is not the ruling. **Never run a bulk strip** — that is how the three exceptions below get destroyed.
  - **The HYPHEN stays.** `per-channel`, `read-only`, `sign-in`, `coming-soon`. Removing hyphens breaks English and makes copy ambiguous.
  - **The em dash as an ABSENCE MARK stays.** The product renders a bare `—` to mean "we have no measurement here" (docs/26 §4). It is a UI token, not prose, and guards assert it. The mechanical test: a dash that is the WHOLE string value is the absence mark and stays; a dash INSIDE a sentence is prose and goes.
  - **A dash that is a stored parse sentinel stays.** `lib/ops/card-copy.ts`'s `TECHNICAL_MARKER` is baked into the `detail` column of every `ops_tasks` row in production and `splitCardDetail` finds the technical half by searching for it. Changing it needs a prod rewrite, not a copy edit.
- **Sahoda speaks in the third person.** "Sahoda could not reach your accounts", never "I could not". 44 third-person mentions set the voice; the two first-person strays were fixed 2026-08-16.
- **Curly quotes around user content are correct typography**, not a tell — §19's own false-positive clause. `Delete "{title}" for good?` keeps them.

The mechanical patterns (AI vocabulary, filler, signposting, servility, emoji, rule-of-three) audit clean and have stayed clean. What actually gets caught here is implementation jargon leaking into user-facing bodies — "the response carried no per-account status" describes our payload, not the reader's situation — plus subjectless fragments and garden-path sentences.

Empty states and errors state the CLAIM precisely: "we never asked" and "we asked and got nothing" are different sentences, and `lib/inbox/emptiness.ts` exists to keep eight of them apart. Its tests assert the claim (`not a reading of your reviews`, `nothing was charged`) and the forbidden claim (`not.toMatch(/\bno reviews\b/)`), never the wording — so rewrite the sentence freely and keep the guarantee.

**Five rules that outrank the skill.** They exist because this product's sentences were built to be exact.

1. **A sentence must never become vaguer than the truth it replaces.** If a rewrite is less specific, or true in fewer cases, it is a defect and not a style improvement. "Publishing key isn't set in this environment", `InboxEmptiness`'s six remedies and /analytics separating "no account connected" from "read failed" are precise on purpose. Print the before and the after and say what the claim is, per string.
2. **Never offer a remedy that cannot work.** The product distinguishes seven kinds of nothing and `no-impossible-remedy.spec.ts` enforces it. A reload cannot create a workspace.
3. **The emoji rule (§18) applies to Sahoda's own interface only.** It must never reach anything that generates or templates a social caption. Emoji are native to that medium and stripping them is a product regression. docs/22 §4 is the record.
4. **Check the sentence the READER gets, not the literal you wrote.** A split whose second half begins with `${…}` is only as good as what that interpolation holds: `platform` is a lowercase key, a count is a numeral, and a list separator is not a category boundary. Five of the first 649 rewrites were wrong this way and the self-check could not see any of them (docs/44).
5. **Tests pin copy. Retarget them, never delete them.** An assertion that checks a CLAIM through a lowercase substring is checking the claim, not the capital letter: make it case-insensitive rather than deleting it. An assertion anchored to an exact engine sentence (`lib/posts/violation-copy.ts`) is a shape gate whose failure mode is a silent downgrade to vaguer copy — move the guard in the same commit as the sentence, and prove it by mutation.

## Workflow

Before doing anything substantial, read `docs/workflow/00_START_HERE.md`.
It carries this project's operating rules, the environment traps that will
otherwise cost you hours, and the verification doctrine this codebase runs
on. It is not optional reading.

If you have been given a role — advisor, design lead, research lead — read
`docs/workflow/08_ROLES.md` for your owned paths, your never-touch list,
your port block, and who is allowed to merge. Working in a cloud session
instead of a local worktree: read `docs/workflow/09_CLOUD_SESSIONS.md`,
which names the branch you must cut from. It is not `main`.

## The one rule

A guard never shown to fail is not a guard. Break the thing it tests.
Watch it go red. Six guards in this repository were found passing by not
looking — including a public payment webhook that no check covered for
months.
