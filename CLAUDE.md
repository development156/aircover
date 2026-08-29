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

`pnpm gate` = `turbo run typecheck lint test && turbo run test:smoke && prettier --check .` — one command, because the two halves that used to sit outside it were both silently red for months. `format:check` is a ROOT script outside turbo, so a green turbo count says nothing about formatting. And `turbo test` runs VITEST ONLY: the Playwright suite sat outside the gate for twenty runs while `golden-path` was failing the whole time, because a product change turned "Create post" from a `<button>` into a `<Link>` and nothing was watching. MEASURED 2026-08-26 on `claude/lead-design-7m7ios` at `b3c0f19`, after the advisor integrated every lane: `playwright test --list` reports **277 tests in 72 files** and `--grep @smoke` reports **118 tests in 37 files**. (It read **275 / 116 in 71 / 36 files** on 2026-08-25 on `claude/lead-research-tz63ld`, the figure this sentence carried until now; the new file is `palette-legibility.spec.ts`, whose 2 tests are BOTH tagged, which is why both halves moved by the same 2 and the file counts by the same 1.) (It read **274 / 115 in 70 / 35 files** on 2026-08-24 on `wt-release`; the new @smoke test then was `marketing-brain.spec.ts` ×1.) **The smoke leg has NOT been run on this lane, and the reason is the environment, not the suite:** in the claude.ai/code remote sandbox, Playwright's bundled Chromium cannot complete any outbound HTTPS request — MEASURED, `https://example.com/` resets the same as Clerk's host does — and every @smoke spec signs in through Clerk. It is NOT a certificate problem: Chromium loads the agent proxy's own HTTP endpoint and plain-HTTP `example.com` with 200, the proxy logs no attempt for any HTTPS one, and Playwright's Node-side request context fetches the same URL fine. Outbound 443 from the Chromium process is reset before it reaches anything, so `--ignore-certificate-errors` is both forbidden and useless here. REQUESTS §25 carries the six measurements. Run the smoke leg where Chromium has a normal network before merging this lane — the `smoke` job on `.github/workflows/gate.yml` is that, dispatched by hand with the project ref typed in. The last full smoke run remains the 2026-08-24 one: **115 passed, none skipped** (15.6m). (It read **229 / 110 in 60 / 32 files** on 2026-08-23 on `wt-page-rest`, the figure this sentence carried until now; the five new @smoke tests are wt-boot's, wt-infra's, and `accent-area-budget` ×1 — which exists because wt-dash2 and wt-page-rest independently wrote DIFFERENT guards into the same filename and the merge kept both.) (It read **209 / 102 in 50 / 28 files** on 2026-08-22 on `wt-integrate2`, the figure this sentence carried until now; the eight new @smoke tests are this lane's `auth-contrast` ×4, `auth-already-signed-in` ×2, `accent-budget` ×1 and `roadmap-figures-scan` ×1. This figure moved TWICE inside this lane — it was re-measured at 109 and a ninth spec landed after — which is the drift this sentence exists to catch, caught on itself.) (It read 76/19 and 67 on 2026-08-20, then 102/32 and 91 earlier on 2026-08-22 — the figure this sentence carried until now, and wrong in both halves by the time it was read. wt-playbooks, wt-knowledge, wt-webhooks, wt-media, wt-radar, wt-radar-ui and wt-remix each brought specs; six routes were added to `no-impossible-remedy` at integration, and `roadmap-honesty` gained a guard that asserts its OWN header count for exactly this reason.) The 159 outside the tag are deliberate and each says why in its own header — `assets.spec.ts` uploads real bytes to storage, `design-audit.spec.ts` is a screenshot tool, `onboarding-build.spec.ts` and `onboarding-money-guard.spec.ts` each drive eight screens and mint a Clerk user. The gate runs the 118, not "every one of them". **A stale number here is the same defect as a stale number on a screen** — re-measure it in the same commit that moves it.

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

## Tone Setup

**"Do a Tone Setup on X" is a standing instruction with a fixed meaning.** Founder's
ruling, 2026-08-29, given against `/brain/knowledge`, whose lead paragraph named the
parts (documents, passages, "Resolve your Brand Brain") and never said what any of it
unlocks.

It means: **that section is screaming tech instead of answering "what customer
capability does this unlock?"** — the CPO tone. Rewrite it so a shop owner learns three
things without asking: **why this exists, how it helps them, and how to use it well.**

Four moves, in this order:

1. **Lead with the capability, not the mechanism.** "The documents Sahoda has read and
   the passages you can search" is an inventory of our parts. "Give Sahoda the documents
   that hold your real prices, so it stops guessing them" is what the reader gets.
2. **Name the best practice on the screen.** A feature nobody knows what to put into
   stays empty: three documents across 33 workspaces was the measurement that produced
   this ruling. Say what to give it, each paired with what that unlocks.
3. **Warn about the failure that looks like success**, before it costs somebody a
   minute. A login wall indexed cleanly and was badged identically to a real rate card.
4. **Every label a customer reads is a capability.** "Indexed" → "Ready to quote".
   Badges, counts and headings are copy, not chrome.

**It never licenses overclaiming.** The five rules below still bind, and a Tone Setup is
the likeliest place to break rule 1: a warmer sentence that is true in fewer cases is a
defect, not an improvement. Narrow the claim to what actually ships — `caption_rewrite`
and `content_variants` read the library; the weekly plan and the site builder do not,
so the copy says "when it rewrites a post" and not "everywhere". **And if the old copy
promised something the code cannot keep, the Tone Setup is when it goes**: the same pass
removed "never trains on it", which nothing in `packages/mesh` enforced.

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

**Pull before anything else, every session.** `git fetch --all --prune` then
`git pull --ff-only origin "$(git branch --show-current)"`. Three lanes and an
integration branch move independently; a stale checkout writes against code that
no longer exists. If `--ff-only` refuses, the lane has diverged — say so and
stop, do not merge past it.

**Lanes.** There are twelve: `wt-girija`, `wt-girija2`, `wt-girija3` and the
same three for `wt-jiban`, `wt-divas` and `wt-karunesh`. A session is started with both facts given, never
inferred:

```
/kickoff owner:girija , branch: wt-girija2 , /lead-research
```

`/kickoff` pins them into `git config sahoda.owner` and `sahoda.lane`, and every
handoff is filed as **`<owner>-<lane>-<date>.md`**. Both halves are load-bearing:
every commit is authored `SAHODALABS`, so git cannot say WHO; and one person runs
three lanes, so a role cannot say WHICH. On 26 August two sessions both wrote
`girija-research-2026-08-26.md` under the old scheme — different lanes, one
filename, and the second would have overwritten the first at merge.

**The role is whatever role command you were given.** It is not read off the
branch name. `wt-girija` running `/lead-research` is correct and normal.

**A cloud session may be pinned to a `claude/...` branch it cannot leave.** That
is fine: work there, keep `sahoda.lane` set to the lane you were given, and say
so in the handoff. **Never abandon a branch another session or a PR is tracking**
— two lead sessions independently refused to do that on 26 August and both were
right.

**You own your lane completely and need approval for nothing inside it**: any
file, any dependency, any migration file, commit and push freely. Lanes merge
into `wt-core`. The one gated step in the whole system is **`wt-core` →
`wt-web`**, which is production. Never cut from `main` — every `main` here is
800+ commits behind and carries a 12-route skeleton of a 59-route product. See
`docs/workflow/08_ROLES.md`.

**All three people share one Claude account and one GitHub account.** So every
commit is authored `SAHODALABS` and `git blame` can never tell you who did what:
**the branch is the identity** and the handoff names the person. It also means
two sessions can land on the same branch with no warning until a push is
rejected — `scripts/cloud-setup.sh` checks the lane against its remote at
startup, and when it says DIVERGED, do not force-push. **One person, one lane,
at a time.**

## How to report

**Open with the answer**, not a summary of the question and not a preamble. If
it worked, say so and give the SHA; if it did not, say that first.

**A table whenever there are three or more comparable things** — branches,
files, counts, before-and-after. Read in two seconds; the same content as prose
is not read at all.

**Short paragraphs, three or four sentences.** Bold only the load-bearing
phrase, once or twice a section. Every claim marked **MEASURED** or
**INFERRED**.

**Write so a non-technical person can follow it.** Either write the whole
report in plain language, or keep the detail and add a short `In plain terms`
paragraph — three or four sentences, no jargon, no file paths. The test: could
someone who has never opened this codebase tell whether it went well? **Plain
is not vaguer** — keep every figure exact.

**Always give a link to look at, after every change.** Founder's ruling,
2026-08-29. A change nobody can open is a claim. Every report that touched a
screen ends with the URL, unasked:

- **The lane's own preview**, which always points at that branch's newest build:
  `https://sahodalabs-git-<lane>-development-4417s-projects.vercel.app`
- **And `https://app.sahodalabs.com`** when the change was promoted, said as
  such, because those are two different things and only one of them is what
  customers see.

Name the screen, not just the host, so the link lands where the change is. Say
plainly when a build is still running or failed rather than giving a URL that
will show the previous version.

**End with exactly two things:** what you did NOT do and why, then anything
needing a decision — one line each, or "nothing needs a decision".

**Do not** narrate steps as you go, pad with what you did not change, apologise,
or write a conclusion that restates the opening. If the answer is one line, make
it one line. Length is not effort.

`/go <task>` carries this plus the agent and skill routing. Use it for any real
task.

## The one rule

A guard never shown to fail is not a guard. Break the thing it tests.
Watch it go red. Six guards in this repository were found passing by not
looking — including a public payment webhook that no check covered for
months.
