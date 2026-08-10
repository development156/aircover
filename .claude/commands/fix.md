---
description: Fix an assigned GitHub bug issue — reproduce with a failing test, fix, verify, review, open a PR. Safe for team cloud sessions.
argument-hint: <issue number>
---

Fix GitHub issue #$ARGUMENTS end-to-end, following the "Team bug-fix sessions" rules in CLAUDE.md. The user may be non-technical: explain progress in plain language, never ask them to run commands, and make every technical decision yourself except the STOP cases below.

Steps, in order — do not skip any:

1. **Setup.** If `node_modules` is missing, run `pnpm install` first. Create a branch `fix/issue-$ARGUMENTS-<short-slug>` from `origin/main`. Never commit to main.
2. **Read the issue.** `gh issue view $ARGUMENTS --comments`. If it does not exist or is not a bug report, stop and tell the user what you found instead. If the issue is unassigned or assigned to someone else, say so and ask the user to confirm it is theirs before continuing.
3. **Find the code.** Locate the files responsible for the reported behavior and read them plus the tests around them.
4. **Reproduce.** Use the `test-writer` agent to write a failing test that demonstrates the bug exactly as reported. Run it and confirm it fails for the reported reason. If you cannot reproduce, stop, post what you tried as a comment on the issue, and tell the user — do not guess-fix. If debugging stalls, use the `debug-agent`.
5. **Fix.** Make the smallest change that makes the failing test pass. No refactors, no renames, no new dependencies, and never touch `packages/shared`, `packages/db/supabase/migrations`, `.env*`, `pricing.config.json`, `.github`, or `.claude/settings.json`. **STOP case:** if the real fix needs a schema change, a shared-contract change, or another package's internals, do not do it — mark your reproduction test `it.skip` with a `// TODO(#$ARGUMENTS)` comment so the branch stays green, and in step 8 state plainly in the PR description what is needed and why you stopped.
6. **Verify.** Run `pnpm turbo run typecheck lint test --filter=...[origin/main] && pnpm format:check`. Live-database tests reporting "skipped" is normal in the cloud sandbox (no `.env` on purpose) — never try to un-skip them or invent credentials.
7. **Review.** Run the `reviewer` agent on `git diff origin/main`. Fix blockers, then re-run step 6.
8. **PR.** Commit (conventional message), push the branch, and `gh pr create` with: `Fixes #$ARGUMENTS`, a plain-language summary of what was wrong, what changed, and how it was verified (name the test). **STOP-case exception:** write `Relates to #$ARGUMENTS` instead of `Fixes` — a merged STOP-case PR must not auto-close the still-unfixed issue. If the change is visible in the web app, note that the Vercel preview URL on the PR is where to see it. Never merge the PR.

Finish by telling the user in plain words: what the bug was, what you changed, the PR link, that the Vercel preview on the PR page is where they can see it working, and that a teammate must review and merge it.
