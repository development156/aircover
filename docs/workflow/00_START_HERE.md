# 00 · Start here

**This is the entry point.** If you are a Claude Code session opening this repository for the first time, read this file, then read the files it names, in the order it names them.

Everything in this folder was written by an advisor that ran roughly fifty build sessions on this project between July and August 2026. The knowledge here was expensive. Most of it was learned by something going wrong in a way that looked exactly like something going right.

---

## Where these files live

```
docs/workflow/
├── 00_START_HERE.md          ← you are here
├── 01_CONTEXT.md             what this product is, and its real state
├── 02_ADVISOR.md             the advisor role, and how to run it here
├── 03_SESSION_PROTOCOL.md    how to write a session brief
├── 04_PARALLEL_SESSIONS.md   worktrees, ports, lanes, merging
├── 05_TRAPS.md               the environment traps and the verification doctrine
├── 06_DESIGN_HANDOFF.md      the designer push/pull workflow
├── 07_WORKFLOW.md            how to run a day
├── 08_ROLES.md               who owns what, who may merge, which branch
└── 09_CLOUD_SESSIONS.md      working from a cloud sandbox, not a worktree
```

Copy this whole folder to `docs/workflow/` in the repository root.

---

## Reading order for a fresh session

**If you are being asked to advise:** read `02_ADVISOR.md`, then `01_CONTEXT.md`, then `05_TRAPS.md`. That is enough to rule on anything.

**If you are being asked to build:** read `03_SESSION_PROTOCOL.md` and `05_TRAPS.md`. Your brief will carry the rest.

**If you are being asked to merge:** read `04_PARALLEL_SESSIONS.md` first. Merging is the most dangerous operation in this project and it has its own rules.

**If you have been given a role** — advisor, design lead, research lead — read `08_ROLES.md`. It carries your owned paths, your never-touch list, your port block, and who is allowed to merge.

**If you are in a cloud session rather than a local worktree:** read `09_CLOUD_SESSIONS.md` before you cut a branch. It names the branch you must cut from, and it is **not** `main` — every `main` in this project is 690+ commits behind and carries a 20-route skeleton of a 58-route product.

---

## Bootstrapping a new Claude Code account

The new account has no memory of anything. It has the repository, and it has these files. That is enough, if you do this:

**1 · Point `CLAUDE.md` at this folder.** Add near the top:

```markdown
## Workflow

Before doing anything substantial, read `docs/workflow/00_START_HERE.md`.
It carries the project's operating rules, the environment traps that will
otherwise cost you hours, and the verification doctrine this codebase
runs on. It is not optional reading.
```

`CLAUDE.md` is loaded into every session automatically. This is the only hook you need.

**2 · Keep the numbered spec pack.** `docs/01_PRD` through `docs/42_Release_Notes` are the product's own record. This folder tells a session *how* to work; those tell it *what* is true.

**3 · Do not summarise these files into `CLAUDE.md`.** A summary loses the specifics, and the specifics are the value. "Watch out for stale builds" is useless. "`turbo build` and `next dev` share `apps/web/.next`, and a dev server on production artefacts answers every page with a React Client Manifest error — a peer got 33 of 63 smoke failures, sub-2s, across unrelated specs, with no OOM" is a session saved.

---

## The one thing to understand before anything else

This codebase has a signature failure mode, and every document here exists because of it.

**Things look correct from every angle you can measure while the thing underneath is wrong.**

Not occasionally. Repeatedly, across five weeks, in forms nobody predicted:

- A payment webhook that no guard checked, because the guard skipped entries preceded by a comment.
- Twenty-six billing tests that had never once executed, because `describe.skipIf` reports a suite that ran nothing as *passing*.
- Lint exiting 0 in nine packages, so that gate leg could not fail.
- `--surface-2` equalling `--surface` exactly in dark mode, so 117 of 120 frames had a fill that separated nothing — and nothing could go red, because a missing 4% fill reads as a design choice.
- The app's primary navigation at 2.49:1 contrast, passing every token check, because nothing measured the *resolved* pair.
- Three routes returning 500 in production while passing every test, because `backdrop-filter` and `background-image` are separate properties and one silently erased the other.
- An E2E suite writing to the production database on every gate run for months, minting 12,196 Clerk users, because the cleanup function returned silently when a key was absent.

Every one of those was green. Every one was wrong.

**So the doctrine is: a guard never shown to fail is not a guard.** Break the thing it tests. Watch it go red. If it does not go red, you have a comfort blanket, not a check.

That sentence is the most important thing in this folder.
