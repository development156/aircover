# 08 · Roles

**Three people work on this repository. This file says who owns what, who may
merge, and which branch each one cuts from.** Read your own card before your
first task. Read the other two before you touch anything shared.

Written 24 August 2026. Every number in the Facts section was measured, not
assumed; the command that produced it is given so you can re-measure when this
file goes stale.

---

## The facts these roles are built on

Re-measure with `git fetch --all` first. All counts are `page.tsx` files under
`apps/web/src/app/`.

| Ref | Date | Routes | Behind `wt-web` |
|---|---|---|---|
| **`origin/wt-web`** | 2026-08-24 | **58** | **0 — this is the product** |
| `origin/main` | 2026-08-07 | 20 | 692 |
| `idivasm/main` | 2026-08-23 | 11 | 693 |
| `idivasm/wt-web` | 2026-08-05 | 20 | 693 |

**Two conclusions, and everything below depends on them.**

**1 · `main` is not the trunk. It is the root commit the trunk was rebuilt on.**
It was never advanced after 7 August. A branch cut from any `main` is a
20-route skeleton of a 58-route product. `.claude/commands/fix.md` still says
*"Create a branch from `origin/main`"* — that instruction is now wrong and is
corrected in `09_CLOUD_SESSIONS.md`.

**2 · The two GitHub remotes are not mirrors of each other.**

| | `development156/sahodalabs` (`origin`) | `IDIVASM/sahodalabs` (`idivasm`) |
|---|---|---|
| Carries the current product | **yes** | no — 693 commits stale |
| Vercel project attached | **yes** — `prj_L4IDks4bMlBwObyKcHzej6lVqm9D` | **none** |
| Preview URL per branch | **yes, every branch** | **no** |

Measured from the Vercel API: the one project's only git link is
`{type: github, org: development156, repo: sahodalabs}`, and its last twenty
deployments cover `wt-web`, `wt-sec`, `wt-handoff`, `wt-loop` and
`squashed-root` — every pushed branch gets a `branchAlias` preview at
`sahodalabs-git-<branch>-development-4417s-projects.vercel.app`.

**So all work happens on `development156/sahodalabs`, cut from `wt-web`.**
A branch pushed anywhere else has no preview, and a branch cut from `main` is
not this product.

---

## A1 — Advisor (the founder)

**Rules on work. Does not write code.** That constraint is the job, not a
limitation of it: an advisor that has been editing files has a stake in the
outcome and stops catching its own silent failures.

| | |
|---|---|
| Runs from | the repository root, `squashed-root`, **never a worktree** |
| Branch | none of its own |
| Owns | the merge, the release, every migration, everything money touches |
| May merge to `wt-web` | **yes — only A1** |
| May apply a migration | **yes — only A1** |
| Port block | 3240–3249 (Lightpanda +100) |
| Lane cap | see *The shared ceiling* below |

Reads `02_ADVISOR.md` for the communication contract. Writes the briefs. Rules
on the reports. Volunteers the uncomfortable thing once, then executes what the
founder decides.

---

## A2 — Design lead

**Edits directly. This one is deliberate.**

Design is a tight loop, and a lead who must describe a change, spawn an agent,
wait and then review a report will produce worse work than one who edits. So A2
is a *lead*, not an advisor, and the discipline comes from the file boundary
below rather than from not-touching.

| | |
|---|---|
| Branch | `wt-design`, cut from `origin/wt-web` |
| **Owns** | `apps/web/src/components/**` · `apps/web/src/app/**/*.tsx` **presentation only** · `packages/shared/tokens.css` · `docs/37_Design_System_v5.md` |
| **Never touches** | server actions · any query · `packages/db/**` · migrations · `packages/shared/**` except `tokens.css` · `pricing.config.json` · `.github/**` · `.claude/settings.json` |
| May merge to `wt-web` | no — pushes `wt-design`, A1 merges |
| May apply a migration | no |
| Port block | 3250–3259 (Lightpanda +100) |
| Visual channel | the branch's own Vercel preview URL |

**The canon is `docs/37_Design_System_v5.md` and nothing else.** Four documents
in this repository each claim some authority over design; three of them are
superseded and one of those still says in its own header that it *"wins for any
token or component value."* It does not. The chain, from each file's own header:

```
docs/37_Design_System_v5.md    CANON — build from this
  supersedes docs/26_Design_System_v4.md      ("Do not build from this file.")
    supersedes docs/08_Design_System_SAHODA_LABS.md   (still claims to win)
    supersedes docs/ui-package/sahoda-labs/
docs/design2.0/UI_RULES_v3.md  superseded — points back at 08 "for governance"
```

The two demo HTMLs illustrate the v1.0 system and are **not** a reference for
new work.

**Read `docs/45_Product_Structure.md` before designing any screen.** 60,507
words, written out of the running product's code and its production database
rather than a specification. It carries what a design cannot be guessed from:
every route and what a person does there, where every value on every screen
comes from, and — the section that matters most — **what this product may not
show.**

**Three things about this product that will otherwise produce unshippable
screens:**

- **It never renders a figure no query produced.** Reference designs are full of
  "Reach 68K–81K" and "12 competitors tracked". Every one of those becomes a
  container with an em dash. This is the differentiator, not a limitation.
- **Empty states are half the product.** Nothing connected, day one, is the
  version most people see first. It must look designed, not failed. There are
  **seven distinct kinds of nothing** — not connected · read failed · not
  configured · no data yet · no workspace yet · suppressed by the platform · we
  could not check today — and each gets its own sentence and its own remedy.
- **State is carried by fill weight, glyph and label — never by hue alone.**
  The product distinguishes CONFIRMED from INFERRED, and that distinction has to
  survive greyscale and re-theming.

**And the mechanics that bite:**

- `md:` `sm:` `lg:` **compile to nothing here.** `--breakpoint-*: initial` wiped
  them; Tailwind emits no CSS and no warning. The real breakpoints are **700 and
  1180**. 390 and 1440 both land in terminal bands and neither exercises
  700–1179 — **capture 1024 as well.**
- `apps/web`'s lint is `design-lint.mjs` and it is **ratcheted**. Adding a
  `text-[Npx]` turns it red. The escape is `--update-baseline` *after* removing
  violations; it refuses to loosen.
- Editing `packages/shared/tokens.css` requires
  `node scripts/gen-tokens-inline.mjs` — there is a generated inline copy and it
  will drift silently.
- **Measure the resolved pair, never the declared token.** `--surface-2` once
  equalled `--surface` exactly in dark mode: 117 of 120 frames had a fill that
  separated nothing, and nothing could go red because a missing 4% fill reads as
  a design choice. The primary navigation measured 2.49:1 while every token
  check passed.

---

## A3 — Research lead

**Access to everything, by the founder's ruling of 24 August 2026.** No path is
withheld.

What replaces the file boundary is **declaration**. A3 announces the scope of a
task in `apps/web/REQUESTS.md` *before starting it*, and A2 reads that file at
the top of every session.

| | |
|---|---|
| Branch | `wt-research`, cut from `origin/wt-web` |
| Owns | everything, by ruling |
| Declares | intended scope in `apps/web/REQUESTS.md` before the first edit |
| May merge to `wt-web` | no — pushes `wt-research`, A1 merges |
| May apply a migration | **no** — writes the migration, A1 applies it |
| Port block | 3260–3269 (Lightpanda +100) |

**Why declaration is not optional.** Two lanes editing the same *file* is a
conflict git will show you. Two lanes editing the same *concept* is two designs
of the same thing where only one survives, and git shows you nothing. The worst
instance in this project: one lane fixed a double-charge in
`onboarding-flow.tsx` while another replaced that whole stage with
`OnboardingStage`, making the file unreachable. **Merging would have silently
killed a money guard and nothing would have failed.**

**A3 must announce, in the handoff, every shared surface touched.** Lanes broke
each other four times exactly this way: `adapterFor` gained a required third
parameter, `decideAttach` a fourth, `violation-copy` changed app-wide,
`BrainRead` gained a required field.

---

## What nobody does

These are engineering facts, not permissions.

- **Nobody executes a publish.** This product posts to real customers' feeds and
  the blast radius of a cross-tenant mistake is another business's account.
- **Nobody runs `supabase db push`.** Production's recorded migration count
  drifts behind its file count and a push re-runs applied migrations. Production
  ref is `rloztdhzfliyvpvxsgjl` and **there is no staging.**
- **Nobody runs irrecoverable SQL** — no `DROP`, no `TRUNCATE`, no `DELETE` or
  `UPDATE` without a `WHERE`, against any table holding real data.
- **Nobody force-pushes a shared branch.** A rebase over someone else's work
  loses it silently.
- **Nobody merges their own branch to `wt-web`.** A1 merges, into a
  `wt-release` cut off `wt-web`, running the full gate after **every single
  merge** — not at the end, or you cannot tell which merge went red.

---

## The shared ceiling

**Four concurrent lanes across all three people, not four each.**

Measured on the founder's machine, 24 August 2026: 15 GB total, 7 GB available.
Each lane is a Next server plus a browser, 3–4 GB. `journalctl -k` shows
`next-server` OOM-killed at 2.3 GB anon-rss on 22 August, and a prior session
recorded 22 kernel OOM kills in three hours with four sessions running.

**This ceiling only binds work running on that machine.** A2 and A3 in cloud
sandboxes do not consume it — see `09_CLOUD_SESSIONS.md`.

**The real ceiling is review, and it is lower.** Sessions run in parallel;
ruling on their reports is serial. Three autonomous lane-launchers can generate
reports faster than one person can read them, and an unread report is worse than
no report because it looks like coverage.

---

## Learning what the others did

Do not build a new mechanism. Three exist and are in use:

| Channel | What it is |
|---|---|
| `apps/web/REQUESTS.md` | the cross-lane request log — 987 lines, tracked, un-ignored by name at `.gitignore:114` |
| `LEARNINGS.md` | the running record, one line per PR — 216 lines, tracked |
| `docs/workflow/handoffs/` | one dated file per role per session, written by `/handoff` |

**`/handoff` persists; `/kickoff` reads.** At the end of a session `/handoff`
writes `docs/workflow/handoffs/<role>-<date>.md` and commits it on that role's own
branch. At the start of the next one, `/kickoff` fetches and reads the newest
handoff from each *other* role's branch before planning anything.

That loop is git-backed, so it needs no live coordination and survives everyone
being asleep. Live messaging between sessions exists — `ListAgents` and
`SendMessage` reach peer sessions on this account — but it is a convenience, not
the record. **If it is not in git, it did not happen.**
