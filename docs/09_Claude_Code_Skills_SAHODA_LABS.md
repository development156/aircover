# Claude Code Skills — SAHODA LABS
**09 · v1.0.** The custom skills to create in the repo before Hour 0. Skills are on-demand procedure cards: the `description` is always visible to Claude; the body loads when relevant. Rules of thumb: **CLAUDE.md = always-true conventions; Skills = how-to procedures; Subagents (doc 10) = isolated workers.** Keep each body short — skills that ramble get ignored.

**Setup:** create each file at `.claude/skills/<name>/SKILL.md` exactly as below. Verify with `/doctor` (flags unused/overweight skills).

---

## 1. `.claude/skills/sahoda-db/SKILL.md`
```markdown
---
name: sahoda-db
description: Use when creating or changing ANY database table, migration, RLS policy, or Postgres function in packages/db. Covers the new-table checklist and migration rules.
---
New table checklist (all mandatory):
1. `workspace_id uuid not null references workspaces(id)` + index on it.
2. `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + membership policy:
   `USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))` (and WITH CHECK for writes).
3. created_at/updated_at defaults; updated_at trigger.
4. Add zod row schema to packages/shared and export types — never redefine in apps.
Migration rules: `supabase migration new <verb_noun>`; NEVER edit an applied migration — create a new one; `supabase db push` requires human approval (permission "ask"). Ledger tables are append-only; balance mutates ONLY inside `apply_ledger_entry()`. Write an RLS test (anon client, cross-tenant read+write must fail) in the same PR.
```

## 2. `.claude/skills/sahoda-ledger/SKILL.md`
```markdown
---
name: sahoda-ledger
description: Use for anything touching credits — charging an AI action, grants, top-ups, refunds, wallet UI, or the apply_ledger_entry Postgres function.
---
Flow for every AI action: HOLD (before model call, idempotency_key = `${action}:${object_id}:${attempt}`) → on success convert to DEBIT with {action_type, object_ref, model_tier, cogs_usd_est} → on failure RELEASE. Users are never charged for failures; partial batches charge completed units only.
All entries go through `apply_ledger_entry()` in ONE transaction with `SELECT ... FOR UPDATE` on the balance row. Entry types: GRANT|DEBIT|HOLD|RELEASE|TOPUP|PERF_REWARD|EXPIRE|ADJUST. Prices come from `pricing.config.json` via shared — never hardcode credit costs. Server actions wrap with `withCredits(action, cost, fn)`. Add/extend the concurrency property test when touching the fn.
```

## 3. `.claude/skills/sahoda-adapter/SKILL.md`
```markdown
---
name: sahoda-adapter
description: Use when writing or editing a social publishing adapter (X, GBP, LinkedIn, Meta, WhatsApp, etc.) or the Constraint Engine in packages/publishing.
---
One adapter per file implementing: `publish(payload) -> {platform_post_id, permalink}` and `fetchMetrics(connection, since)`. Format payloads ONLY via the Constraint Engine spec (char limits, media rules, link policy, credit surcharges) — the editor uses the same spec, one source of truth.
Errors: classify transient (retry, expo backoff ×3) vs permanent (revoked token, policy reject → status=failed + reconnect CTA). Tokens come from the vault helper decrypted in-memory only — never log, never return, never store plaintext. Every publish writes post_publish_logs. Add a fixture test per adapter (recorded response) before wiring UI. If a platform capability needs approval we don't have: feature-flag with an honest "pending" state — never mock success.
```

## 4. `.claude/skills/sahoda-mesh/SKILL.md`
```markdown
---
name: sahoda-mesh
description: Use when adding or modifying an AI task, prompt, model route, or provider call in packages/mesh (the Model Mesh).
---
Adding a task: 1) row in ai_model_routes {task, tier: nano|economy|standard|premium|research} 2) zod OUTPUT schema in shared — all model output is parsed, one repair retry, then typed error (no silent mocks in prod) 3) prompt = static system contract + cache-controlled Brand-Brain prefix (cache key = brain version hash) + user payload last 4) log every call to ai_provider_logs {task,tier,provider,model,tokens,cached,cost_usd,latency,credits,workspace_id} 5) set max_tokens deliberately.
Tier guide: guardrails/classifiers=nano · captions/variants/replies=economy · plans/site-edits/brand_guidelines=standard · site generation=premium (budgeted) · onboarding research=research. Fallback: OpenRouter → direct SDK → typed error. Never call a provider from apps/web — server actions only.
```

## 5. `.claude/skills/sahoda-brandskin/SKILL.md`
```markdown
---
name: sahoda-brandskin
description: Use when working on theming, workspace_themes, the Readability Guard, color extraction, or any new color pair anywhere in the app.
---
Only these 7 tokens are themeable: --p --pfg --pstrong --acc --t50 --t100 --t300 (Design System §2). Neutrals & semantics are fixed; danger is crimson, never brand orange.
Any new color pair MUST pass the Guard: OKLCH, adjust foreground lightness only until text≥4.5:1 / UI≥3:1, clamp surface chroma ≤0.15, keep semantic hue bands, emit a human-readable diff_log. Themes are versioned rows in workspace_themes; apply = SSR-inlined CSS vars (no FOUC), swap <150ms; per-user default-override wins. No raw hex in apps/web — ESLint enforces.
```

## 6. `.claude/skills/sahoda-tour/SKILL.md`
```markdown
---
name: sahoda-tour
description: Use when creating or editing a Sahoda Guide tour, adding data-guide anchors, or touching the tour/mascot engine.
---
Tours are versioned JSON per FSD Appendix C: steps[{anchor, say(≤2 sentences), action: none|click|input_min:N, spotlight, confirm_spend?}], ≤8 steps, per-locale copy. UI targets get stable `data-guide="area.element"` attributes — never CSS selectors. A missing anchor auto-skips + logs; a tour may degrade, never break the screen; overlay always dismissible.
confirm_spend steps ALWAYS pause (even in future DIFM). New/renamed anchors: update the registry + run the anchor-integrity check before PR. Reduced-motion: static mascot, fade-only. Tours never fire during approvals.
```

## 7. `.claude/skills/sahoda-ui/SKILL.md`
```markdown
---
name: sahoda-ui
description: Use for any React/Next.js UI work in apps/web — components, screens, styling, states.
---
Tokens only (Design System §2 via Tailwind names) — zero hex literals. Components come from shadcn/ui restyled per §6; check the two demo HTMLs for canonical look before inventing. Every component ships all states: hover/active/disabled/focus-visible(2px --acc)/loading(skeleton>400ms, never long spinners)/empty(one action + Sahoda tip)/error(what happened → what we did → one action + trace id, "we didn't charge you" when true).
Copy: sentence case, verb-first buttons, costs visible before spend, "predicted" on Twin numbers. Files <300 lines; client components only when interactive; server actions for mutations; zod-parse every boundary. Tabular-nums on all money/credits/metrics.
```

## 8. `.claude/skills/sahoda-ship/SKILL.md`
```markdown
---
name: sahoda-ship
description: Use before opening any PR or declaring a task done — the pre-ship checklist.
---
Run: `pnpm turbo typecheck lint test --filter=...[origin/main]` then the Playwright smoke tag if UI changed. Confirm: no new table without RLS+test (sahoda-db) · every new AI action charges via withCredits (sahoda-ledger) · no raw hex · no console.log of tokens/PII · migrations untouched unless you are wt-db · pricing from config, not literals.
Then: small PR (<400 lines ideally), description = what/why/how-tested, request the reviewer subagent, append one LEARNINGS.md line (date · decision/gotcha). If a rule recurred twice, promote it into the package CLAUDE.md in the same PR.
```

---

## External skills to also enable
- **frontend-design** (Anthropic official, via plugin marketplace — doc 10): use for any net-new screen aesthetics beyond the system.
- **Spec Kit** commands (doc 10) for any feature bigger than a screen: `/speckit.specify → plan → tasks` before code.
Skip installing generic skill mega-packs for the sprint — context weight without lift. Re-evaluate post-Alpha with `/doctor`.
