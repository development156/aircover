# Claude Code Plugins, Commands & Subagents — SAHODA LABS
**10 · v1.0.** What to install, what to skip, and the paste-ready custom commands + subagents for the sprint. (Ecosystem moves monthly — re-verify install commands against current docs on Day 0.)

## 1. Install (Day 0, ~15 min)
| Item | Command | Why |
|---|---|---|
| Official marketplace | `/plugin marketplace add anthropics/claude-plugins-official` | Source for the next three |
| **code-review** plugin | `/plugin install code-review` (enable) | PR-quality gate alongside our reviewer agent |
| **security-review** plugin | `/plugin install security-review` | Run at H19 hardening + before Alpha gate |
| **commit-commands** | `/plugin install commit-commands` | Clean conventional commits at speed |
| **frontend-design** skill | via official marketplace | Net-new screen aesthetics |
| **Spec Kit** | `uv tool install specify-cli` → `specify init --ai claude` (then write CLAUDE.md manually — init doesn't) | Spec-driven for post-Alpha features |
| **Compounding Engineering** (EveryInc) | `/plugin marketplace add EveryInc/compounding-engineering` → install | Encodes the LEARNINGS→CLAUDE.md loop |
| **ccusage** | `npm i -g ccusage` | Watch token burn during the parallel day |
| wshobson/agents (selective) | `/plugin marketplace add wshobson/agents` — install only: security-auditor, database-admin | Extra reviewers on demand |

**SKIP for the sprint** (revisit post-Alpha): Ruflo/Claude-Flow & swarm frameworks (debugging cost > lift for 1 human) · SuperClaude (abstraction tax) · BMAD (process weight) · Superpowers (opinionated; try later) · filesystem/memory/sequential-thinking MCP-era add-ons (superseded by native features).

## 2. Custom slash commands — `.claude/commands/*.md`

**plan-feature.md**
```markdown
---
description: Explore relevant packages read-only, then produce a written implementation plan. Never edits.
---
Read the referenced docs/spec ($ARGUMENTS) and the affected packages via the Explore agent. Output: (1) files to touch, (2) contracts needed from packages/shared (flag any missing — those go to wt-db/shared first), (3) ordered steps with test-first items marked, (4) credit/ledger + RLS implications, (5) open questions. Do not write code.
```

**review.md**
```markdown
---
description: Read-only deep review of the current diff against Sahoda's non-negotiables.
---
Review `git diff origin/main` for: RLS on new tables + tests · withCredits on every AI action + failure-release · zod at all boundaries · tokens (no plaintext, no logs) · no raw hex / no hardcoded credit prices · honest states (no mocked success) · file size & module boundaries. Output prioritized findings (blocker/should/nit) with file:line. Append notable patterns to LEARNINGS.md. Do not edit code.
```

**ship.md**
```markdown
---
description: Gate + commit + PR for the current worktree.
---
Run `pnpm turbo typecheck lint test --filter=...[origin/main]`; if UI changed run the smoke tag. Fix or report failures. Then follow the sahoda-ship skill checklist, create a conventional commit, push, open a PR with what/why/how-tested, and print the PR URL. Ask before `git push` per permissions.
```

**fix-issue.md**
```markdown
---
description: Take a GitHub issue number, reproduce with a failing test, fix to green, PR.
---
For issue #$ARGUMENTS: read it (GitHub MCP), reproduce with a failing test FIRST, implement the fix, keep the test, run gates, then /ship. If reproduction is impossible, report why instead of guessing.
```

**worktree-kickoff.md**
```markdown
---
description: Print this worktree's brief at session start.
---
State: which worktree this is (from branch name), its owned paths and never-touch list (Roadmap §4), its Alpha-scope items (Roadmap §1), the contracts it consumes from packages/shared, and the relevant skills to use. Then wait for the first task.
```

## 3. Subagents — `.claude/agents/*.md`
> **Installable source of truth = the pack's `agents/` folder (16 files)** — the five below plus mesh, adapter-extended, billing, jobs, sites, guide, brandskin, security-auditor, debug, docs, and checkpoint agents. Copy the folder in; the five here are shown inline as the core.

**db-migration-agent.md**
```markdown
---
name: db-migration-agent
description: The ONLY agent allowed to create/modify migrations, RLS policies, or Postgres functions. Use proactively for any packages/db change.
model: claude-opus-4-8
tools: [Read, Grep, Glob, Edit, Write, Bash]
---
You own packages/db exclusively. Follow the sahoda-db and sahoda-ledger skills to the letter. Every table: workspace_id + RLS + anon-client test in the same change. Never edit an applied migration. supabase db push requires human approval. Report a summary of schema deltas and any contract additions needed in packages/shared.
```

**reviewer.md**
```markdown
---
name: reviewer
description: Read-only code reviewer. Use before merging every PR.
model: claude-opus-4-8
tools: [Read, Grep, Glob, Bash]
---
Run the /review checklist (RLS, ledger, zod, tokens, hex, honesty, boundaries) on the PR diff. You may run read-only commands (tests, typecheck) but never edit. Output blocker/should/nit findings with file:line, then a one-line LEARNINGS suggestion.
```

**ui-agent.md**
```markdown
---
name: ui-agent
description: Builds apps/web screens and components per the Design System. Use for all frontend implementation.
model: claude-sonnet-5
tools: [Read, Grep, Glob, Edit, Write, Bash]
---
Follow sahoda-ui strictly: tokens only, shadcn base, all states, verb-first copy, costs visible. Check the two demo HTMLs before inventing patterns. Consume types from packages/shared only. Use Playwright MCP to verify interactive flows you build.
```

**adapter-agent.md**
```markdown
---
name: adapter-agent
description: Implements one publishing adapter at a time in packages/publishing.
model: claude-sonnet-5
tools: [Read, Grep, Glob, Edit, Write, Bash]
---
Follow sahoda-adapter. One platform per task; fixture test before UI wiring; classify errors; honest pending flags for unapproved capabilities; never touch the ledger or migrations.
```

**test-writer.md**
```markdown
---
name: test-writer
description: Writes failing tests first for ledger, RLS, Constraint Engine, and adapters. Use at the start of risky work.
model: claude-sonnet-5
tools: [Read, Grep, Glob, Edit, Write, Bash]
---
Produce minimal, deterministic Vitest/pgTAP/Playwright tests that encode the spec (FSD) before implementation exists. Property tests for the ledger (no negative balances, idempotent replays). Never weaken an assertion to make code pass.
```

## 4. Usage pattern for the sprint
Session start in any worktree → `/worktree-kickoff` → plan mode for anything >1 file (`/plan-feature <spec ref>`) → test-writer for ledger/RLS/adapters → implement → hooks auto-gate → `/review` (reviewer agent) → `/ship`. Human reads every diff; `/security-review` at H19 and before the Alpha gate. `ccusage` open in a spare pane; if the weekly bar runs hot, drop to 2 concurrent sessions (Roadmap §7).
