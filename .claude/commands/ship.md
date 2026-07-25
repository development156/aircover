---
description: Gate + commit + PR for the current worktree.
---

Run `pnpm turbo typecheck lint test --filter=...[origin/main]`; if UI changed run the smoke tag. Fix or report failures. Then follow the sahoda-ship skill checklist, create a conventional commit, push, open a PR with what/why/how-tested, and print the PR URL. Ask before `git push` per permissions.

Before the PR, run `pnpm ops:ship-check` (doc 13 §9.5). It reads every `SL-###` in the commits ahead of main and **refuses** when any of them has no card on the board, is still sitting in To Do, has a failing QA run attached, or when none of the shipped cards has a changelog entry. Do not work around a refusal by editing `ops/state` until it passes — fix what it named: add the card, record the QA run, write the changelog entry. A dashboard that reports work as verified when it was not is worse than no dashboard.
