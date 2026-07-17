# Build Companion — SAHODA LABS
**12 · v1.0 · Everything else the build session needs.** This is the glue doc: paste-ready configs, prompts, checklists, and reference data. If a value conflicts with another doc, the canon order in 00_README applies.

---

## §1 How to use this pack in a fresh session
1. Upload the whole BuildPack (or the repo containing `/docs`) to the new Claude Code project.
2. Complete **§10 Day-0 checklist** (accounts, keys, test accounts) — ~3h, do it before Hour 0.
3. Create the config files from **§4–§6** + skills (doc 09) + commands/agents (doc 10) + `.mcp.json` (doc 11).
4. Paste the **§2 Kickoff Prompt** into the first Claude Code session. Follow the Roadmap (doc 05) hour-by-hour.

## §2 KICKOFF PROMPT — Session 1 (paste verbatim)
```text
You are the lead engineer building SAHODA LABS, an AI Marketing OS. The complete spec pack is in /docs (or uploaded): read 00_README for canon order, then 05_Roadmap (the 2-day sprint we are executing), 03_TSD (architecture), 02_FSD (behavior), 08_Design_System (tokens/components), 12_Build_Companion §3–§9 (tree, env, pricing, prompts). PRD/BRD are context, not tasks.

We are at Roadmap Hour 0. Your job this session, in PLAN MODE first, then execute after my approval:
PHASE A — CONTRACTS (solo, nothing parallel yet):
1. Scaffold the monorepo exactly per Companion §8 (pnpm + Turborepo). 
2. packages/db: full core schema per TSD §9 Alpha subset — workspaces, workspace_members, users_profile, brand_memory, memory_events, posts, post_variants, post_media, post_publish_logs, planner_events, connections, credit_ledger + balance, plans, subscriptions, sites, site_pages, site_sections, leads, guide_tours, tour_progress, workspace_themes, ai_provider_logs, audit_logs, app_settings — every table with workspace_id, RLS enabled + membership policies (sahoda-db skill), apply_ledger_entry() per sahoda-ledger.
3. packages/shared: zod schemas + TS types for every table row, every AI task output (incl. the Brand Brain resolve contract in FSD M1), the Constraint Engine spec type, pricing loaded from pricing.config.json (Companion §9), and the package interface stubs for mesh/publishing/billing so parallel worktrees code to contracts.
4. Root files: CLAUDE.md (§4), .claude/settings.json (§6), .env.example (§7), tokens.css from Design System §2.
5. Commit "phase-a: contracts", then print the git worktree commands for the 5 worktrees in Roadmap §4 and STOP.
Constraints: follow every rule in CLAUDE.md; no feature code in Phase A; migrations are yours alone this session; ask before supabase db push.
```

## §3 Per-worktree handoff prompts (paste at each worktree's first session, after `/worktree-kickoff`)
- **wt-db:** "Own packages/db for the sprint. Now: ledger concurrency + RLS anon-client test suites (test-writer first), seed script for the 'Chai & Chapters' sandbox brand (data in FSD M15 + the two demo HTMLs), then support other worktrees' contract requests. Nothing else edits migrations."
- **wt-mesh:** "Implement packages/mesh per TSD §4 Alpha subset: provider clients (OpenRouter 3 keys + OpenAI fallback), tier router, ai_provider_logs telemetry, tasks `brand_guidelines` (FSD M1 JSON contract, zod + 1 repair retry, demo-fallback payload) and `captions`/`content_variants`. Server-side only."
- **wt-web:** "apps/web per 06/08 and the two demo HTMLs as canonical look: shell (rail/topbar/credit chip), Clerk↔workspaces, then Onboarding = Signal Resolution Console (port sahoda_brand_brain_demo.html into React, real call via mesh action), Look & Feel step, Posts editor with variants, Planner, Dashboard CMO, mascot + 6 tours (sahoda-tour). ui-agent + Playwright MCP verify each flow."
- **wt-pub:** "packages/publishing: Constraint Engine v0 spec (X, GBP, LinkedIn, IG-text) consumed by editor AND adapters; X + GBP adapters per sahoda-adapter with fixture tests; OAuth routes + AES token vault helper. Real accounts from §10; honest pending flags elsewhere."
- **wt-billing:** "packages/billing + wallet UI: withCredits() wrapper on every AI action, ledger UI with per-entry 'why', Stripe test-mode checkout + idempotent webhook → subscription + monthly GRANT, entitlements read. Prices only from pricing.config.json."

## §4 Root `CLAUDE.md` (final)
```markdown
# SAHODA LABS — AI Marketing OS
Docs are law: /docs 00_README → canon order. Sprint = docs/05 (2-day Alpha). Behavior = 02_FSD. Architecture = 03_TSD. Tokens/components = 08_Design_System (no raw hex anywhere). Demos sahoda_dashboard_demo.html + sahoda_brand_brain_demo.html = canonical UI reference.

## Stack
pnpm+Turborepo · apps/web Next.js 15 App Router+TS+Tailwind+shadcn · apps/jobs Trigger.dev · packages: db(Supabase+RLS+pgvector) shared(zod SOURCE OF TRUTH) mesh publishing billing render · Clerk · Upstash · Cloudflare(sites) · Resend · Sentry.

## Commands
pnpm install · pnpm dev · turbo typecheck lint test · supabase migration new <name> (db push = ASK) · pnpm playwright test --grep @smoke

## Non-negotiables
- Types/schemas import from packages/shared only — never redefine.
- Every table: workspace_id + RLS + anon-client test (skill: sahoda-db). Ledger only via apply_ledger_entry (skill: sahoda-ledger); users never pay for failures.
- All model calls via packages/mesh server-side (skill: sahoda-mesh); zod-parse outputs; no mock-success in prod paths — honest "pending" flags instead.
- OAuth tokens: AES vault, decrypt in memory, never log/return.
- Credit prices from pricing.config.json only. Costs shown before spend.
- UI: tokens only, all states, verb-first sentence-case copy, tabular-nums for numbers (skill: sahoda-ui).
- Small files (<300 lines), one adapter per file, plan mode for >1-file work, tests-first for ledger/RLS/adapters.

## Do NOT touch
.env*, secrets/, applied migrations, pnpm-lock.yaml by hand, prod resources. Only wt-db edits packages/db/migrations.

## Loop
/worktree-kickoff at session start · /plan-feature before building · /review then /ship to finish · one LEARNINGS.md line per PR; recurring rules get promoted into the relevant CLAUDE.md.
```

## §5 Per-package `CLAUDE.md` stubs
- **packages/db:** "RLS pattern + new-table checklist = sahoda-db skill verbatim. Never edit applied migrations. Ledger fn is sacred; property tests in ./tests. pgvector HNSW for brand_embeddings (post-Alpha)."
- **packages/shared:** "Source of truth. Adding a type = adding its zod schema + export. Breaking change ⇒ note in PR title [contract]. pricing.config.json read-only from code."
- **packages/mesh:** "Tasks table + tiers per sahoda-mesh. Every call logged. max_tokens explicit. No provider calls outside this package."
- **packages/publishing:** "Constraint Engine = single source for limits/formatting. Adapter recipe = sahoda-adapter. Fixtures in ./fixtures."
- **packages/billing:** "withCredits wraps every AI mutation. Webhooks idempotent by event id. Test-mode only until backlog #8."
- **apps/web:** "sahoda-ui rules. Server actions for mutations. data-guide anchors for anything tour-visible. Playwright @smoke on golden paths."
- **apps/jobs:** "Idempotency key on every task. Retries expo ×3. Nothing publishes without a post_publish_logs row."

## §6 `.claude/settings.json` (project, committed)
```json
{
  "permissions": {
    "defaultMode": "acceptEdits",
    "allow": ["Bash(pnpm:*)","Bash(turbo:*)","Bash(supabase:*)","Bash(npx trigger.dev:*)","Bash(wrangler:*)","Bash(gh:*)","Bash(git status)","Bash(git diff:*)","Bash(git add:*)","Bash(git commit:*)","Bash(git worktree:*)","Read(./**)","Write(apps/**)","Write(packages/**)","Write(docs/**)"],
    "deny": ["Read(./.env)","Read(./.env.*)","Read(**/secrets/**)","Bash(rm -rf:*)","Bash(curl:*)","Bash(supabase db reset:*)"],
    "ask": ["Bash(git push:*)","Bash(supabase db push:*)","Bash(wrangler deploy:*)","Bash(gh pr merge:*)"]
  },
  "hooks": {
    "PostToolUse": [{ "matcher": "Write|Edit|MultiEdit", "hooks": [
      { "type": "command", "command": "npx prettier --write \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true" },
      { "type": "command", "command": "npx eslint --fix \"$CLAUDE_TOOL_INPUT_FILE_PATH\" 2>/dev/null || true" } ] }],
    "PreToolUse": [
      { "matcher": "Edit|Write|MultiEdit", "hooks": [ { "type": "command", "command": "F=$(echo \"$CLAUDE_TOOL_INPUT\" | jq -r '.file_path // .tool_input.file_path // empty'); echo \"$F\" | grep -qE '\\.env|/migrations/' && [ -z \"$ALLOW_SENSITIVE\" ] && { echo 'Blocked: .env/migrations need ALLOW_SENSITIVE=1 (wt-db only)' >&2; exit 2; } || exit 0" } ] },
      { "matcher": "Bash", "hooks": [ { "type": "command", "command": "echo \"$CLAUDE_TOOL_INPUT\" | grep -qE 'DROP TABLE|TRUNCATE|service_role' && { echo 'Blocked dangerous command' >&2; exit 2; } || exit 0" } ] } ],
    "Stop": [{ "hooks": [ { "type": "command", "command": "INPUT=$(cat); [ \"$(echo $INPUT | jq -r '.stop_hook_active')\" = 'true' ] && exit 0; pnpm turbo run typecheck test --filter=\"...[origin/main]\" || { echo 'Gates failing — fix before stopping' >&2; exit 2; }" } ] }]
  }
}
```

## §7 `.env.example` (canonical; A = Alpha-required, L = later)
```bash
# App
NEXT_PUBLIC_APP_URL=http://localhost:3000            # A
NEXT_PUBLIC_SITE_DOMAIN=sahoda.site                  # A  tenant sites suffix
# Auth — Clerk (A)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= CLERK_SECRET_KEY= CLERK_WEBHOOK_SECRET=
# DB — Supabase (A)   service key = server/jobs ONLY, never client, never MCP
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= SUPABASE_PROJECT_REF=
# AI — Model Mesh (A)  three cost-isolated OpenRouter keys per TSD §4
OPENROUTER_API_KEY_RESEARCH= OPENROUTER_API_KEY_TEXT= OPENROUTER_API_KEY_IMAGE=
OPENAI_API_KEY=            # A  direct fallback
GOOGLE_GEMINI_API_KEY=     # L  image fallback
# Billing (A: Stripe TEST mode; L: live + Razorpay)
STRIPE_SECRET_KEY= STRIPE_PUBLISHABLE_KEY= STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID= STRIPE_GROWTH_PRICE_ID= STRIPE_AGENCY_PRICE_ID=
RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=   # L
# Publishing (A: X + Google/GBP; L: rest)
X_CLIENT_ID= X_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID= GOOGLE_OAUTH_CLIENT_SECRET=              # GBP scopes
LINKEDIN_CLIENT_ID= LINKEDIN_CLIENT_SECRET=                      # A-stretch
META_APP_ID= META_APP_SECRET= WHATSAPP_ACCESS_TOKEN= WHATSAPP_PHONE_NUMBER_ID=   # L (pending approval)
# Infra (A)
TRIGGER_SECRET_KEY= TRIGGER_PROJECT_ID=
UPSTASH_REDIS_REST_URL= UPSTASH_REDIS_REST_TOKEN=
CLOUDFLARE_API_TOKEN= CLOUDFLARE_ACCOUNT_ID= CLOUDFLARE_ZONE_ID=  # sites deploy (sahoda.site)
RESEND_API_KEY= SENTRY_DSN=
# Security (A)
TOKEN_VAULT_KEY=            # 32-byte hex — AES-256-GCM for OAuth tokens
JOB_SIGNING_SECRET=         # HMAC for internal job endpoints
CONTEXT7_API_KEY=           # MCP docs (doc 11)
```

## §8 Monorepo tree
```
sahoda/
├─ apps/ web/ (Next 15)  jobs/ (Trigger)  mcp/ (backlog #18)
├─ packages/ shared/  db/ (supabase/ migrations, tests, seed)  mesh/  publishing/  billing/  render/ (backlog #7)
├─ docs/            ← this pack (00–12 + demos)
├─ brand/ src/ dist/  ← assets per 07 §10 (logos live in the v1 zip: public/logo.png, "logo black.png")
├─ .claude/ settings.json  skills/  commands/  agents/
├─ .mcp.json  CLAUDE.md  pricing.config.json  turbo.json  pnpm-workspace.yaml
```

## §9 `pricing.config.json` (canonical machine-readable; from PRD §7 — edit only via app_settings post-launch)
```json
{ "currency_note": "credits; INR plans 499/1499/3999, USD 12/29/79; grants: free 100, starter 1500, growth 5000, agency 15000; rollover_cap_x": 2, "perf_reward": {"per_post": 2, "monthly_cap_pct": 10, "lifetime_milestone_cap": 20},
  "actions": { "caption_rewrite": 1, "inbox_reply": 1, "post_variants": 3, "twin_preflight": 4, "image_standard": 6, "image_premium": 12, "carousel": 8, "video_script": 3, "site_edit": 3, "playbook_run": 2, "radar_scan": 5, "seo_article": 10, "remix_pack": 15, "loop_cycle": 20, "campaign_plan": 25, "brand_research": 50, "site_generate": 100, "voice_minute": 25 } }
```

## §10 Day-0 checklist & approvals tracker
**Accounts (create with role emails per the IT plan — admin@/billing@ groups, MFA on):** Cloudflare (+ buy/point `sahoda.site`, API token zone-scoped) · Supabase project · Clerk app · Vercel · Trigger.dev · Upstash · Resend (verify domain) · Sentry · Stripe (TEST) · OpenRouter (create the 3 named keys, $100 wallet, per-key limits) · GitHub org/repo · Google Cloud project (OAuth consent + GBP API) · X developer app (pay-per-use) · password manager + secrets (Doppler or Vercel envs).
**Test fixtures:** throwaway X account · GBP test location · Stripe test cards · seed images.
**Start now, gates backlog only:** | Meta app review (☐ submitted __) | WhatsApp business verification (☐) | Razorpay KYC (☐) | LinkedIn Partner (☐) | YouTube quota (☐) | — each row: status/date/owner/fallback per Roadmap §2.

## §11 Assets inventory
Logos: in the v1 zip → `public/logo.png` (app icon w/ orange blade, transparent), `logo black.png` (2161×728 black lockup, transparent); extract the single blade per Brand Kit §10 script (orange-pixel mask). Fonts: kit Drive TEXT folder (Garet/Outfit/Helvetica) — web uses Outfit (Google Fonts) now. Demos: the two HTMLs (UI canon). Deck: SAHODA_LABS_Next_Version.pptx (stakeholders).

## §12 Glossary (one-liners for the build session)
**Brand Brain** living, versioned business memory (brand_memory + memory_events) · **Signal Console** the onboarding intake+resolve UI (FSD M1 mechanics) · **Brand Skin** workspace theming of the 7 tokens w/ Readability Guard · **The Loop** weekly plan→create→test→publish→measure cycle; **L0–L3** autonomy dial (suggest→autopilot) · **Twin** synthetic pre-flight audience panel · **Mesh** our model router (tiers nano→premium + research) · **Constraint Engine** declarative per-platform limits used by editor AND adapters · **Ledger** double-entry credits (HOLD/DEBIT/RELEASE…) · **Guide/Sahoda** mascot + spotlight tours (data-guide anchors) · **Playbooks** switch-on automation recipes · **Alpha Gate** Roadmap §5 DoD.

## §13 Decision log (seed — append as you go)
2026-07-17 · Sprint compressed to 2 days by founder; scope = Roadmap §1, rest = ordered backlog · WhatsApp/Meta/Razorpay deferred behind approvals (started Day 0) · Stripe test-mode only in Alpha · Sites on `*.sahoda.site` (custom domains backlog #11) · Studio uses uploads until renderer (#7) · Naming final: SAHODA LABS / mascot Sahoda · Brand Brain adopts Signal Console mechanics (FSD M1 updated) · No demo-mode JSON DB in prod paths (staging seed instead).

## §14 If things break (quickies)
Publish OAuth failing >90min → fixture-mode flag, keep UI moving (Roadmap §7) · Ledger imbalance alert → freeze AI actions, run invariant query, restore from PITR if needed · Model JSON invalid twice → serve typed error + demo-fallback (Brain only), file issue · Usage caps hit → 2 sessions max, Haiku for search, resume next window · Roll back = revert PR + `vercel rollback`; sites keep last 5 bundles.
