# SAHODA LABS — Subagent Roster (installable)
Copy every `*.md` in this folder (except this README) into `.claude/agents/` at the repo root. This folder is the **source of truth for agents**; doc 10 shows the core five inline and keeps commands/plugins.

## Roster
| Agent | Model | Mode | Use for |
|---|---|---|---|
| db-migration-agent | Opus 4.8 | write | ONLY agent for migrations/RLS/Postgres fns |
| reviewer | Opus 4.8 | read-only | Every PR before merge |
| security-auditor | Opus 4.8 | read-only | H19 hardening, Alpha Gate, post-incident |
| test-writer | Sonnet 5 | write | Failing tests FIRST for ledger/RLS/adapters/E2E |
| ui-agent | Sonnet 5 | write | All apps/web screens & components |
| mesh-agent | Sonnet 5 | write | packages/mesh: tasks, routing, telemetry |
| adapter-agent | Sonnet 5 | write | packages/publishing: one platform at a time (+metrics) |
| billing-agent | Sonnet 5 | write | packages/billing: rails, webhooks, wallet, entitlements |
| jobs-agent | Sonnet 5 | write | apps/jobs: Trigger.dev tasks, later the Loop |
| sites-agent | Sonnet 5 | write | Site generation + Cloudflare deploy + forms→leads |
| guide-agent | Sonnet 5 | write | Tour/mascot engine, tours JSON, anchors |
| brandskin-agent | Sonnet 5 | write | Theming, extraction, Readability Guard |
| debug-agent | Opus 4.8 | read-heavy | Any bug unsolved after ~20 min |
| docs-agent | Sonnet 5 | write (docs only) | Keep /docs, CLAUDE.md, LEARNINGS, ADRs in sync |
| checkpoint-agent | Sonnet 5 | read+bash | Run the merge-order + gates ritual at checkpoints |

## Rules of engagement
1. Descriptions say "use PROACTIVELY" where Claude should self-invoke; otherwise say "Use the <name> subagent to …".
2. **reviewer** runs on every PR; **security-auditor** at H19 + before the Alpha Gate. Neither ever edits.
3. Only **db-migration-agent** touches `packages/db/migrations` (hook-enforced).
4. Builders consume types from `packages/shared` only; contract gaps go back to db/shared first.
5. Model strategy: Opus for schema/review/security/debugging; Sonnet for building; built-in **Explore** (Haiku) for "where is X?" searches — no file needed.
6. Every agent ends with a short summary + one LEARNINGS.md line when it hit a gotcha.
