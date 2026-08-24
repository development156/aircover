---
description: End the session — write a durable handoff the other roles will read.
---

Write this session's handoff **to a file and commit it**. A handoff that lives
only in the conversation is not a handoff; the next session cannot read it.

## 1 · Establish where you are

```bash
git branch --show-current
git log --oneline -10
git status --short
```

Derive your role from the branch: `wt-design` is `design`, `wt-research` is
`research`, anything else is `advisor` unless you were told otherwise. Get
today's date with `date +%F` — do not guess it.

## 2 · Verify before you claim

Run the gate legs that apply and record their **real output**. Then:

- **Never report an unrun suite as passed.** If a leg did not run, the handoff
  says UNRUN, not passed.
- **A leg finishing in under a second is a cache replay** and verified nothing.
- **Never pipe the gate** — a pipe returns the pipe's exit code, not the gate's.
- **Group failures by error message, never count them.** Six unrelated tests
  failing at once is an environment; one test failing is a diff.

## 3 · Write the file

Write to `docs/workflow/handoffs/<role>-<YYYY-MM-DD>.md`. If that file already
exists, append a new `## Session <n>` section rather than overwriting it.

Required sections, all of them, by name:

```markdown
# Handoff — <role> — <YYYY-MM-DD>

**Branch** `<branch>` at `<sha>`, cut from `<base>`. Pushed: yes/no.

## What shipped

One row per item: what it is, the file:line or SHA that proves it, and the
named test that covers it.

## What was NOT done, and why

State your own boundaries. A session that says "I did not run Playwright — it
needs the lane's keys, so this is 4 of 5 legs and it is UNRUN, not passed" is
a session worth trusting.

## Shared surfaces touched

Every shared primitive, shared type, fixture or token another role consumes.
A required field breaks constructors, not readers — say which. Lanes have
broken each other four times through this exact omission: `adapterFor` gained
a required third parameter, `decideAttach` a fourth, `violation-copy` changed
app-wide, `BrainRead` gained a required field.
Write "none" if none. Do not leave the section out.

## Guards written, and the mutation that proved each

For every guard: the mutation you applied, and that you watched it go red.
A guard never shown to fail is not a guard.

## Anything retracted

With the measurement that justifies it. State what you MEASURED, never what
you inferred — a wrong retraction is worse than no check.

## Anything that changes an assumption

Something the next person would otherwise get wrong.

## Gate

Each leg named, with its real output, marked PASS / FAIL / UNRUN.
```

Mark every claim **MEASURED** or **INFERRED**. A "done" claim needs a
`file:line`, a named passing test, a git SHA, or a live URL. Status codes and
exit codes are not evidence.

## 4 · Commit and push it

```bash
git add docs/workflow/handoffs/
git commit -m "handoff(<role>): <one line>"
git push origin <branch>
```

If the working tree carries files that are not yours, leave them alone and say
so in the handoff rather than committing them under an unrelated message.

## 5 · Then tell me

Print the same content in the conversation, and give me the path and the SHA.
