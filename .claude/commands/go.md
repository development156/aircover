---
description: Do a task under this project's rules, with a readable report at the end.
argument-hint: <what to do>
---

Do this: **$ARGUMENTS**

Everything below applies. Do not restate it back to me — just work under it.

---

## First: size the job

**Match the machinery to the task.** Everything below is available, not
mandatory. Over-tooling a small job is a real cost here, not a harmless one —
all three people share one usage quota, so a fan-out from this lane eats what
the other two have.

| The job is                                            | Do this                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------ |
| a question, a one-line answer, reading one file       | **Just answer it.** No agents, no skills. Skip to _How to report_. |
| one file, a known fix, a rename, a copy change        | Do it yourself. Load a skill only if it governs that file.         |
| several files, a feature, a bug you cannot yet locate | Agents and skills, as below.                                       |
| a claim you are about to make                         | A second agent to refute it, whatever the size.                    |

Say which of those you picked in one line, then work. If you reach for three
agents to answer something you could have read in one file, that is the wrong
call and it costs the other lanes.

## Use agents, in parallel

**Send them in ONE message or they run one after another and you lose the point.**

- Spans many files? Agents. You want the conclusion, not the file dumps.
- About to claim something is true? Put a **second agent on it told to refute
  it**. Findings that survive a hostile reader are the only ones worth my time.
  This repo has produced confident-but-wrong findings repeatedly — a contrast
  detector once reported eight failures that were its own clamping artefact.
- Reach for the named agent, not a generic one:

| Need                                                                            | Agent                                                                                                                                           |
| ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| the diff, before any merge                                                      | `reviewer`                                                                                                                                      |
| verify a claim or a guard, adversarially                                        | `auditor`                                                                                                                                       |
| a failing test FIRST — ledger, RLS, adapters, golden path                       | `test-writer`                                                                                                                                   |
| a bug past ~20 minutes, or a flake                                              | `debug-agent`                                                                                                                                   |
| auth, tokens, webhooks, RLS, money                                              | `security-auditor`                                                                                                                              |
| map a multi-branch merge before touching it                                     | `merger`                                                                                                                                        |
| **the only agent that writes migrations or RLS**                                | `db-migration-agent`                                                                                                                            |
| screens · theming · adapters · AI tasks · jobs · sites · billing · tours · docs | `ui-agent` · `brandskin-agent` · `adapter-agent` · `mesh-agent` · `jobs-agent` · `sites-agent` · `billing-agent` · `guide-agent` · `docs-agent` |
| types · SQL · architecture · planning · builds · e2e                            | `typescript-reviewer` · `database-reviewer` · `architect` · `planner` · `build-error-resolver` · `e2e-runner`                                   |

## Load the skill before the work, not after

Read after, it is a review. Read before, it is a specification.

| Working on                                    | Load                                      |
| --------------------------------------------- | ----------------------------------------- |
| a React/Next screen or component              | `sahoda-ui` · `impeccable` for a redesign |
| theming, tokens, any new colour pair          | `sahoda-brandskin`                        |
| **any** table, migration, RLS, PG function    | `sahoda-db` · `postgres-patterns`         |
| credits, charging, refunds, wallet            | `sahoda-ledger`                           |
| an AI task, prompt, model route               | `sahoda-mesh` · `cost-aware-llm-pipeline` |
| a publishing adapter or the Constraint Engine | `sahoda-adapter`                          |
| a guide tour or `data-guide` anchors          | `sahoda-tour`                             |
| auth, user input, secrets, endpoints          | `security-review`                         |
| before opening a PR or saying done            | `sahoda-ship`                             |

## What "done" means here

- **A guard never shown to fail is not a guard.** Break the thing it tests,
  watch it go red, report the mutation. Assert the **sentence**, never falsiness
  — an accidental `TypeError` is not a passing guard.
- **Never report an unrun suite as passed.** Name each gate leg PASS / FAIL /
  **UNRUN**.
- **A turbo leg under one second is a cache replay** and verified nothing.
- **Never pipe the gate** — a pipe returns the pipe's exit code.
- **Group failures by error message, never count them.** Six unrelated suites
  red at once is an environment; one is a diff.
- A "done" claim needs a `file:line`, a named passing test, a git SHA, or a live
  URL.

## Never, in any lane

No publish · no `supabase db push` · no applying a migration to production · no
`DROP`/`TRUNCATE`/unqualified `DELETE`/`UPDATE` · no force-push to a shared
branch · **never render a figure no query produced** · never collapse
per-channel variants into one body.

You may **write** a migration freely. Applying one is a different act.

---

# How to report back

**This matters as much as the work.** Reports here have been long, shapeless and
hard to act on. Fix that:

**Open with the answer.** First line is the verdict or the result — not a
summary of what you were asked, not "I'll help you with", not a preamble. If it
worked, say so and give the SHA. If it did not, say that first.

**Then the evidence, shortest path first.** What you measured, and the command
or file that produced it.

**Use a table whenever there are three or more comparable things.** Branches,
files, test counts, before-and-after. A table is read in two seconds; the same
content as prose is not read at all.

**Short paragraphs. Three or four sentences.** A wall of text is a wall.

**Bold only the load-bearing phrase**, once or twice per section. If everything
is bold, nothing is.

**Mark every claim MEASURED or INFERRED.** Not decoration — it is the difference
between a report I can act on and one I have to re-verify.

**End with exactly two things:**

1. **What you did NOT do, and why.** The sentence that makes the rest
   trustworthy. "The smoke leg is UNRUN — it needs Clerk keys this sandbox does
   not have" is worth more than three paragraphs of what went right.
2. **What needs a decision from me**, if anything. One line each. If nothing
   does, say "nothing needs a decision" and stop.

**Do not:**

- narrate your steps as you go ("Now I will…", "Let me…") — report at the end
- pad with what you did not change
- apologise, or thank me for the question
- repeat the same fact in the summary and the body
- write a conclusion that restates the opening

If the answer is one line, **make it one line.** Length is not effort.

---

Finish with `/handoff owner:<name> , branch:<lane>` so the next session in this
lane can pick it up.
