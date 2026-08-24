# 03 · Session protocol

A session brief is an executable document. It is not a description of what you want; it is everything a session needs to do the work without asking a question, plus everything it needs to not be fooled by its own tools.

Every brief has the same six parts.

---

## The anatomy

**Header** — model, effort, mode, and how it runs.
**Permissions** — total, unconditional, with the two engineering exceptions.
**Setup** — worktree, port, env, and the shell.
**Traps** — the ones that apply to this task.
**The task** — what to build, and what must remain true.
**Report format** — what must come back, named.

---

## The reusable preamble

Paste this above every brief, changing only `<BRANCH>`, `<PORT>` and `<CUT FROM>`.

```text
MODEL:  Claude Opus 5
EFFORT: <high | maximum · ULTRATHINK>
MODE:   execute, continuous, fully autonomous. COMMIT AND PUSH after
        every item that passes the gate. Never leave a lane uncommitted.
RUN AS: claude --dangerously-skip-permissions

════════ PERMISSIONS — TOTAL, PERMANENT, NEVER RE-CHECKED ════════
Every permission is granted for this entire session and is never
re-checked. NEVER ask yes or no. NEVER pause for confirmation. NEVER say
"should I" or "do you want me to". NEVER stop to check whether something
is allowed — it is. Vercel MCP, Playwright, Context7 and web access are
enabled. Writes, production reads and additive migrations: authorised.

TWO EXCEPTIONS, and they are engineering facts rather than permissions:
  1. Do not execute a publish. This product posts to real customers'
     feeds, and the cross-tenant guard's blast radius is another
     business's account.
  2. Run no irrecoverable SQL — no DROP, no TRUNCATE, no DELETE or
     UPDATE without a WHERE, on any table holding real data.

NEVER run supabase db push. Production's migration record drifts behind
its file count and a push re-runs applied migrations. Production ref is
rloztdhzfliyvpvxsgjl. Prove isolation POSITIVELY by printing the
server's own answer, never by inequality against one string — a brief
once had a typo in that ref and a session caught it.

════════ SETUP ════════
Repo: /home/divas/Documents/GitHub/sahodalabs
  git worktree add -b <BRANCH> .claude/worktrees/<BRANCH> <CUT FROM>
  cd .claude/worktrees/<BRANCH>
  git config --worktree user.name "SAHODALABS"
  git config --worktree user.email "development@sahodalabs.com"
A new worktree is born authored as the personal account, which the
deployment rejects — set the author before your first commit.

Copy env — .env files are gitignored and do NOT travel to a worktree.
ALL THREE, or things fail in confusing ways:
  cp ../../../.env .env
  cp ../../../apps/web/.env apps/web/.env
  cp ../../../apps/web/.env apps/web/.env.local
The third is what Playwright reads. Two sessions could not run smoke at
all for want of it.

SHELL IS FISH — wrap any loop, heredoc, export, <(...) or
${VAR:-default} in bash -c '...'. Fish uses psub, not <().
Dev server on port <PORT>. Lightpanda on <PORT+100>. Never touch another
session's port.
Never pkill by a pattern matching your own shell's command line — a
session killed its own process group that way mid-command.

SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl is REQUIRED or Playwright
refuses at module scope. That guard exists because this suite was
writing to the production database on every gate run and minted 12,196
Clerk users. Clean up what you create and COUNT ROWS AFTERWARDS.

════════ RUN AGAINST next start, NEVER pnpm dev ════════
  KILL THE SERVER FIRST, then delete .next, then build.
  pkill -f "next dev"
  rm -rf apps/web/.next
  pnpm --filter @sahoda/web build
  pnpm --filter @sahoda/web start -p <PORT>
Deleting .next under a LIVE server leaves the process holding the
deleted inodes — one route answers 200 while everything else dies, and
it reads exactly like a code regression.
Dev numbers are fiction: a session measured a 2.5× difference and found
races that only appear on the fast path.

GROUP FAILURES BY ERROR MESSAGE, NEVER COUNT THEM. A session reported 32
failures: 61 lines were ERR_CONNECTION_REFUSED from a dev server it had
killed itself, and 2 were real. A count is not a verdict.

════════ THE GATE — FIVE PARTS, AND TWO OF THEM LIE ════════
Use scripts/gate.mjs and gate:verdict, --concurrency=1.
  turbo typecheck·lint·test → vitest → playwright @smoke → prettier →
  turbo build
· NEVER pipe the gate — a pipe returns the pipe's exit code.
· A turbo leg finishing under a second is a CACHE REPLAY and verified
  nothing. Force it.
· Stage 5 leaves a production .next that stage 3 then runs against, so
  a second consecutive gate fails. Clear it between runs.
· apps/web's lint is design-lint.mjs and is RATCHETED. Adding a
  text-[Npx] turns it red. The escape is --update-baseline AFTER
  removing violations; it refuses to loosen.
· The JS budget is live with 8 kB of slack per route, and an unbudgeted
  route is a hard failure. If a chunk moves, regenerate with
  `pnpm --filter @sahoda/web perf:budget:write` — NEVER remove the guard.
Report each leg by name with its real output. NEVER report an unrun
suite as passed.

════════ NON-NEGOTIABLE ════════
· ONE BODY AND ONE FORMAT PER CHANNEL. Instagram's caption differs from
  LinkedIn's, each publishes independently, publish_status is per
  variant. This is what the product does that competitors do not.
· NO INVENTED NUMBERS. Never a figure no query can produce. Anything
  that is a claim about the user's own business — reach, revenue,
  predicted performance, competitor counts — is the one class this
  product may never invent.
· NO DEAD ENDS. Every control works or is labelled coming soon.
· COMING SOON renders as a div, never <button disabled> — a disabled
  button is still announced as a button and still promises an action.
· THE LEDGER NEVER LIES. Append-only, compensating entries, never edits.
  Run ledger-invariants.mjs before and after; account for the delta.
· RLS ON EVERY TABLE.
· A GUARD NEVER SHOWN TO FAIL IS NOT A GUARD — print what it parses,
  break the thing it tests, watch it go red.
· READ TEXT, NOT BOXES.
· A WRONG RETRACTION IS WORSE THAN NO CHECK — state what you MEASURED.
· Every claim MEASURED or INFERRED.
```

---

## Choosing effort

**ULTRATHINK** when the work is judgement or investigation: deciding what leads on a screen, mapping a merge, diagnosing something that looks impossible, designing a system.

**High** when the work is execution against a known list: applying a decision already made, fixing named defects, sweeping for a pattern already characterised.

Ultrathink on a mechanical task produces elaborate reasoning about settled questions, and the reports get longer without getting better. The runs where it earned its place were the ones that found something nobody asked about.

---

## Naming the traps that apply

Do not paste all of `05_TRAPS.md` into every brief. Pick the ones the task will actually meet.

A visual lane needs the pointer-parking trap, frame hashing, and contact sheets. A database lane needs the PGlite drift and the generated-column trap. A merge lane needs branch-operation guarding and the containment check. A performance lane needs `next start` and cache replay.

**Include the evidence, not the rule.** "Watch for stale builds" teaches nothing. The measured story teaches the shape.

---

## Specifying proof, not outcome

The weakest briefs say *fix X*. The strongest say *fix X, and prove it by breaking it*.

For every fix, ask for the mutation that would reveal its absence. Sessions that do this catch their own bad work:

- One swapped its approval gate for a wrong condition and only 2 of 6 assertions went red — a separate price check was refusing the same rows. **Two guards on one hole look exactly like one guard working.**
- One found three of four refusal tests passing with the guard *deleted*, because `existing.some(…)` throws on null and the outer catch returns `ok:false`. Asserting `result.ok === false` proved nothing; asserting the *sentence* reddened all four.
- One wrote a guard with the same flaw as the code it guarded — both checked index `[0]` only.

**Assert sentences, not falsiness.**

---

## The report format

Ask for these, by name, every time:

- What was done, with evidence per item
- What was NOT done, and why
- Anything discovered that changes an assumption
- Every guard written, and the mutation that proved it
- Anything retracted, with the measurement that justifies it
- The full five-part gate, each leg named with real output
- Every claim marked MEASURED or INFERRED

The fourth and fifth lines are where the value hides. A session that reports a retraction with its measurement is doing the thing this project is built on.
