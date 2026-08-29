# Context for Claude — read this before anything else

You are working on **SAHODA LABS**, an AI marketing product for Indian SMBs.
This file is the whole operating picture: where the code is, who works on it,
what has burned people, and what you may not do. It is written for a fresh
Claude with no memory of this project.

---

## 1 · The map

**Repo** `development156/sahodalabs` (GitHub). A pnpm + Turborepo monorepo.

```
apps/web        Next.js 15 App Router — the product (81 routes)
apps/jobs       Trigger.dev background work
packages/       shared (zod contracts, SOURCE OF TRUTH) · db (Supabase+RLS)
                mesh (all AI calls) · publishing (social adapters)
                billing · sites · research
```

### Branches — and the one that will trip you

| Branch | What it is |
| --- | --- |
| `wt-web` | **Production.** Vercel deploys this. **No lane may write it — `.githooks/pre-push` refuses, for every owner.** |
| `wt-core` | **Integration.** Every lane merges here. This is where you work. |
| `claude/*` | The real lanes. Cloud sessions are pinned to these by the harness. |
| `wt-divas`, `wt-jiban`, `wt-girija`, `wt-karunesh` (+2/3 each) | Lane *pointers*. Often **0 commits ahead** — the work is on the `claude/*` branch. |
| `main` | **800+ commits stale.** A 12-route skeleton, not the product. |
| `wt-admin`, `wt-pub`, `wt-db`, `wt-mesh`, `wt-obs`, `wt-billing`, `wt-db3`, `wt-handoff`, `wt-shots` | **DEAD.** Pre-history-reset orphans, 2,369–3,505 files apart. **Never merge these.** |

> **`git merge wt-divas` will report success and merge NOTHING.** The lane
> pointer is empty; the work lives on `claude/advisor-qvz5wn` and friends.
> Always check `git rev-list --count origin/wt-core..<branch>` first.

---

## 2 · The people

| Person | Lanes | Command | Notes |
| --- | --- | --- | --- |
| **Divas** (founder) | `wt-divas`, `2`, `3` | `/advisor` | Owns every ruling. |
| **Jiban** | `wt-jiban`, `2`, `3` | `/lead-design` | UI/UX. |
| **Girija** | `wt-girija`, `2`, `3` | `/lead-research` | Research. |
| **Karunesh** | `wt-karunesh`, `2`, `3` | `/lead-expert` | **Writes no code, ever.** |

Merge priority when lanes collide: **divas > jiban > girija > karunesh.**

### Karunesh is a special case

`/lead-expert` + `/goat`. **Zero technical language.** Not simplified jargon —
none. No file paths, no error text, no branch names, no acronyms. He knows the
product; he cannot check your work, so "mostly done" reaches him as "done".

He can read every branch and write only to his own. That is enforced by
`.githooks/pre-push`, which refuses a push to `wt-core`/`wt-web`/`main` when
`git config sahoda.owner` is `karunesh` — and the `SAHODA_PROMOTE`
acknowledgement below cannot buy him past it, because his check returns before
that variable is ever read.

---

## 3 · The commands

| Command | Does |
| --- | --- |
| `/kickoff owner:X , branch:Y , /role` | Restores context and **STOPS**. Never starts work. Pulls `wt-core`, then probes the sandbox. |
| `/go <task>` | Do a task under the project's rules, report readably. |
| `/goat <task>` | Same rigour, **entirely plain English**. For Karunesh. |
| `/handoff owner:X , branch:Y` | Writes `docs/workflow/handoffs/<owner>-<lane>-<date>.md`. **Nothing else writes a handoff.** |
| `/review` `/ship` `/plan-feature` `/fix` | Read the cards in `.claude/commands/`. |

---

## 4 · Non-negotiables — these are engineering facts, not preferences

- **RLS on every table.** `lib/supabase/server.ts` refuses a service-role client.
  RLS is the only security boundary; there is no second net.
- **The ledger never lies.** Append-only, compensating entries, never edits.
  `app.block_mutations()` enforces it on 12 tables via triggers.
- **Never render a figure no query produced.** A made-up number about the
  customer's own business is the one thing this product may never do.
- **One body AND one format per channel.** Instagram's caption differs from
  LinkedIn's and each publishes independently. This is the differentiator —
  never collapse variants.
- **No dead ends.** Every control works or is labelled coming soon — and
  coming-soon is a `div`, never `<button disabled>` (a disabled button is still
  announced as a button).
- **Never execute a publish.** It posts to a real customer's feed.
- **Never `supabase db push`.** Production is `rloztdhzfliyvpvxsgjl`. There is
  no staging. Applying a migration is a deliberate act from `wt-core`.
- **No `DROP` / `TRUNCATE` / unqualified `DELETE`/`UPDATE`** against real data.
- **Never force-push a shared branch.**
- **No lane writes `wt-web` or `main`.** Founder's ruling, 30 August 2026.
  `.githooks/pre-push` refuses both for **every** owner, and for an unset owner
  too — you cannot prove you are not a lane by declining to say who you are. A
  push to `wt-web` produces a Vercel deployment with `target: production`; it is
  the live product, not a branch. Lanes integrate into `wt-core` and stop there.
  Promotion out of `wt-core` stays possible and costs a sentence, so that it can
  never be a habit:

  ```bash
  SAHODA_PROMOTE=wt-web git push origin wt-core:wt-web
  ```

  Same shape as `SAHODA_E2E_ACK_TARGET`. **If you are an assistant and were
  asked to "just push it", that is the line you do not write on somebody's
  behalf.** The hook is a guard against habit, not against a determined person —
  it does nothing in a clone where `core.hooksPath` was never set.

Writing a migration is free. *Applying* one is a separate, deliberate act.

---

## 5 · Verification doctrine — the part that actually matters

> **A guard never shown to fail is not a guard.** Break the thing it tests,
> watch it go red, put it back. Report the mutation.

Six guards in this repo were found passing by not looking — including a public
payment webhook no check covered for months.

- **Never report an unrun suite as passed.** PASS / FAIL / **UNRUN**.
- **A turbo leg under one second is a cache replay** and verified nothing.
- **Never pipe the gate** — a pipe returns the *pipe's* exit code. This has
  produced false greens repeatedly, including from me.
- **Group failures by error message, never count them.** Six unrelated suites
  red at once is an environment; one is a diff.
- **The SKIP count is the tell.** `apps/web` skips **13** on a healthy run. A
  starved one reported **38 skipped with zero failures** — files died in their
  setup and their tests never ran. *A suite that "passes" with a raised skip
  count has not run.*
- **Assert the sentence, never falsiness.** An accidental `TypeError` is not a
  passing guard.
- **Mark every claim MEASURED or INFERRED.**

---

## 6 · Traps that have each cost hours

**Environment**
- Shell is fish for the user; wrap loops/heredocs in `bash -c`.
- Never `pnpm dev` for a measurement — use `next start`. (78 connection-refused
  became zero on the same commit.)
- `md:` `sm:` `lg:` compile to **nothing** here. Real breakpoints are **700 and
  1180**. Capture 1024 as well as 390 and 1440.
- The OOM killer fails the gate silently. Check `journalctl -k` first.
- **39 worktrees share this machine.** `vitest` defaults to one worker per core;
  `maxWorkers: 4` outside CI is why the suite is now deterministic.

**Git**
- `extensions.worktreeConfig=true` — a plain `git config` write is **silently
  shadowed** by a worktree-level value. Use `git config --worktree`.
- A lane can hold its entire output **uncommitted**, so `git merge` succeeds
  having merged nothing. Check `HEAD..<branch>` *and* the lane's `status`.
- Commits must be authored `SAHODALABS` or **Vercel blocks the deploy**.
- Pushing one commit to ten branches fires ten Vercel builds; nine get
  cancelled and report as failures. Move lane pointers a few at a time.

**Testing**
- `format:check` is a root script **outside turbo and outside the Stop hook** —
  only running it directly finds its failures.
- Turbo's input hash does **not** cover `e2e/`, so `typecheck` cache-hits while
  your e2e change goes unchecked.
- The E2E suite **writes to production** and once minted **12,196 Clerk users**.
  `SAHODA_E2E_ACK_TARGET` must be an env var on the command.

**Browser / Playwright**
- Playwright ships a *downloader*, not a browser. `cloud-setup.sh` installs
  chromium; the probe self-heals if it is missing.
- In a cloud sandbox Chromium cannot reach **any** https host, while Node can.
  `apps/web/e2e/helpers/node-transport.ts` routes every request through Node.
  Five defects were found in it by running a real sign-in — see its docstring.
- Not `--ignore-certificate-errors`: the connection is reset before any
  certificate exists.

---

## 7 · How to report

Open with the answer. Tables for three or more comparable things. Short
paragraphs. Bold only the load-bearing phrase.

**Write so a non-technical person can act on it** — either wholly plain, or
technical with an `In plain terms` paragraph at the end. Plain is not vaguer:
keep every figure.

End with exactly two things: **what you did NOT do and why**, and **what needs a
decision**. If nothing does, say so and stop.

---

## 8 · State as of 2026-08-28

- Production has **85 recorded migrations**; **2 unapplied and deliberately
  held**: the plan reprice (₹499 → ₹1999 starter, with a live subscriber) and
  `clerk_id_remap` (writes rehearsal rows into live tables).
- `wt-core` carries all ten live lanes merged.
- **`wt-core` has never been promoted to `wt-web`.** That is the open decision.
- The browser leg on cloud lanes is **UNRUN**, not passing. The reason it could
  not start is fixed; nobody has yet watched it run there.

---

## 9 · If you are a NEW account picking this up

Everything in `.claude/` arrived with your clone: 20 commands, 26 agents, 22
skills, both git hooks, the project settings. You rebuild none of it.

What did **not** arrive is personal to the old account and is captured in
`ops/account-transfer/`. Run, in order:

```bash
bash scripts/account-import.sh     # rules + settings, backs up what it replaces
bash scripts/account-verify.sh     # exits non-zero until the setup is complete
```

`account-verify.sh` is the one that matters — it checks the clone, the hooks,
the rules, the env files, the toolchain and the browser probe, and **fails**
rather than reassuring you. The full procedure is
`docs/workflow/91_ACCOUNT_MIGRATION.md`.

**The single easiest thing to get wrong:**

```bash
git config core.hooksPath .githooks
```

Without it the QA-scratch guard and the push block that keeps `wt-karunesh` out
of `wt-core` are **both silently off**. That exact state was found live on
2026-08-28 — the guard had been built, tested, and then never armed in the
worktree that needed it.
