# SAHODA LABS — Build Pack · START HERE
**00 · v1.0 · 17 Jul 2026.** Upload this whole pack into your build session. Fifteen docs + an installable `agents/` folder (16 files). One product.

## Canon order (when documents disagree)
1. **05_Roadmap v2.0** — timing & sprint scope (supersedes ALL timeline references elsewhere, incl. PRD §9 / BRD O1 dates)
2. **02_FSD** — exact product behavior
3. **03_TSD** — architecture & data model (also serves as the SDD)
4. **08_Design_System** — every token/component value (beats 06/07 on values)
5. **12_Build_Companion** — configs, prompts, env, pricing config
6. Everything else = context and identity.

## The pack
| # | File | What it is | Read when |
|---|---|---|---|
| 00 | This file | Index + canon | First |
| 01 | PRD | Vision, USPs, modules, credits economy | Context (skim §1–3, §7) |
| 02 | FSD | Per-module behavior, states, flows, Brand Brain mechanics | Before building any module |
| 03 | TSD | Architecture, Mesh, ledger, schema/ERD, security (= SDD) | Before Phase A |
| 04 | BRD | Business objectives, unit economics, GTM | Context |
| 05 | **Roadmap v2.0 — 2-DAY SPRINT** | Alpha scope, hour-by-hour, worktrees, gate, backlog | **The plan you execute** |
| 06 | UX/UI | Screen-by-screen specs, IA, mascot direction | With each screen |
| 07 | Brand Kit | Identity, logo rules, sampled palette, fonts | Brand questions |
| 08 | Design System | Canonical tokens + component specs | Open in every UI session |
| 09 | Skills | 8 paste-ready `.claude/skills` for this repo | Day-0 setup |
| 10 | Plugins/Commands/Subagents | Installs + paste-ready commands & agents | Day-0 setup |
| 11 | MCP | `.mcp.json`, add-ons, security rules | Day-0 setup |
| 12 | **Build Companion** | Kickoff prompt, CLAUDE.md, settings/hooks, .env, pricing.json, checklists, glossary | Day-0 + Hour-0 |
| 13 | **Admin Ops** | /admin panel + Claude-Code-fed dev dashboard | Before building /admin |




| — | **agents/** (16 files) | Installable subagent roster → copy into `.claude/agents/` | Day-0 setup |
| — | sahoda_dashboard_demo.html | Living UI reference: Home/CMO screen | UI canon |
| — | sahoda_brand_brain_demo.html | Living UI reference: onboarding Signal Console | UI canon |

## Start in 4 steps
1. **Day 0 (~3h):** Companion §10 accounts/keys/test-fixtures; start the approval clocks (they gate backlog only).
2. Create repo config from docs 09/10/11 + copy `agents/` into `.claude/agents/` + Companion §4–§7; `/doctor` clean.
3. **Hour 0:** paste Companion §2 Kickoff Prompt (plan mode, Phase-A contracts, then fan out per Roadmap §4 with §3 handoff prompts).
4. Ship only through the hooks + `/review` + `/ship`; pass the **Alpha Gate (Roadmap §5)** before showing anyone.

Three rules that outrank speed: RLS on everything · the ledger never lies · no fake success states. Now go build. 🧡
