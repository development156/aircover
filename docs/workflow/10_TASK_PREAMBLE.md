# 10 · The task preamble

**Paste the block below above any task, in any lane.** It tells the session what
it is allowed to do, which agent to reach for, which skill to load, and what
counts as done here.

It is deliberately short. Everything long lives in the files it names.

---

## The block

```text
Before you start:

WHERE YOU ARE
  Read CLAUDE.md and docs/workflow/08_ROLES.md. You own this lane completely and
  need approval for nothing inside it. You may merge into wt-core. You may not
  write to wt-web. Pull first: git fetch --all --prune, then
  git pull --ff-only origin "$(git branch --show-current)".

USE AGENTS. IN PARALLEL. THEY ARE THE POINT.
  One session can run several at once and they do not see each other's work,
  which is why three independent looks beat one thorough one.
  · Anything spanning many files -> agents, in ONE message so they run together.
  · Anything you are about to claim is true -> a SECOND agent told to REFUTE it.
    Findings that survive a hostile reader are the only ones worth reporting.
  · Reach for the named one, not a generic:
      reviewer          the diff, before any merge
      auditor           adversarially verify a claim or a guard
      test-writer       failing test FIRST, for ledger/RLS/adapters/golden path
      debug-agent       a bug that has survived ~20 minutes, or a flake
      security-auditor  auth, tokens, webhooks, RLS, anything money
      merger            map a multi-branch merge before executing it
      db-migration-agent  the ONLY agent that writes migrations or RLS
      ui-agent · brandskin-agent · adapter-agent · mesh-agent · jobs-agent ·
      sites-agent · billing-agent · guide-agent · docs-agent
      typescript-reviewer · database-reviewer · architect · planner ·
      build-error-resolver · e2e-runner · code-reviewer

LOAD THE SKILL BEFORE THE WORK, NOT AFTER
  · any React/Next screen or component ....... sahoda-ui  (+ impeccable for a
                                               redesign, frontend-patterns)
  · theming, tokens, a new colour pair ....... sahoda-brandskin
  · ANY table, migration, RLS, PG function ... sahoda-db  (+ postgres-patterns,
                                               database-migrations)
  · credits, charging, refunds, wallet ....... sahoda-ledger
  · an AI task, prompt, model route .......... sahoda-mesh (+ cost-aware-llm-pipeline)
  · a publishing adapter or the Constraint Engine  sahoda-adapter
  · a guide tour or data-guide anchors ....... sahoda-tour
  · auth, user input, secrets, endpoints ..... security-review
  · before opening a PR or saying done ....... sahoda-ship
  · deploys, CI, rollback .................... deployment-patterns
  · a REST surface ........................... api-design

WHAT DONE MEANS HERE
  · A guard never shown to fail is not a guard. Break the thing it tests, watch
    it go red, and report the mutation. Assert the SENTENCE, never falsiness -
    an accidental TypeError is not a passing guard.
  · Never report an unrun suite as passed. Name each gate leg PASS/FAIL/UNRUN.
  · A turbo leg under one second is a cache replay and verified nothing. Force it.
  · Never pipe the gate; a pipe returns the pipe's exit code.
  · Group failures by error message, never count them. Six unrelated suites red
    at once is an environment; one is a diff.
  · Every claim marked MEASURED or INFERRED. A "done" claim needs a file:line, a
    named passing test, a git SHA, or a live URL.
  · Say what you did NOT do, and why. That sentence is what makes the rest
    trustworthy.

NEVER, IN ANY LANE
  · execute a publish - it posts to a real customer's feed
  · supabase db push, or apply a migration to production
  · DROP, TRUNCATE, or DELETE/UPDATE without a WHERE against real data
  · force-push a shared branch
  · render a figure no query produced
  · collapse per-channel variants into one body

FINISH WITH
  /handoff owner:<name> , branch:<lane>
```

---

## Why the agent lines are worded like that

**"In ONE message so they run together"** — agents sent in separate turns run in
sequence. The whole gain is parallelism.

**"A SECOND agent told to REFUTE it"** — this project has repeatedly produced
plausible findings that were wrong: a contrast detector reported eight failures
that were its own clamping artefact; a truncation sweep produced 142 false
positives before it was trustworthy. An agent that tries to kill a finding is
cheaper than a session spent chasing one.

**"The named one, not a generic"** — the Sahoda agents carry this codebase's
rules. `db-migration-agent` is the only one that writes migrations because
migrations are the one artefact that cannot be un-shipped.

## Why skills load first

A skill read after the work is a review. Read before, it is a specification.
`sahoda-db`'s new-table checklist is the difference between a table that ships
with RLS and one that ships without and gets found later.

## What is not in the block, on purpose

The traps. There are too many to paste and they are lane-specific:
`05_TRAPS.md` has them, `/kickoff` tells the session to read the ones its task
will actually meet. Pasting all of them into every prompt trains sessions to
skim.
