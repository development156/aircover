---
description: Gate + commit + PR for the current worktree.
---
Run `pnpm turbo typecheck lint test --filter=...[origin/main]`; if UI changed run the smoke tag. Fix or report failures. Then follow the sahoda-ship skill checklist, create a conventional commit, push, open a PR with what/why/how-tested, and print the PR URL. Ask before `git push` per permissions.
