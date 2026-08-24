---
description: Set up a new parallel worktree lane
---

Read docs/workflow/04_PARALLEL_SESSIONS.md.

Create a lane for the branch and base I name:

git worktree add -b <BRANCH> .claude/worktrees/<BRANCH> <BASE>
cd .claude/worktrees/<BRANCH>
git config --worktree user.name "SAHODALABS"
git config --worktree user.email "development@sahodalabs.com"
cp ../../../.env .env
cp ../../../apps/web/.env apps/web/.env
cp ../../../apps/web/.env apps/web/.env.local

Verify `git branch --show-current` afterwards — never assume a checkout succeeded. Then tell me which port is free in the 3240–3249 block by checking what is listening.
