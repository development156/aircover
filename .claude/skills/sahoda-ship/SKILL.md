---
name: sahoda-ship
description: Use before opening any PR or declaring a task done — the pre-ship checklist.
---

Run: `pnpm turbo typecheck lint test --filter=...[origin/main] && pnpm format:check` then the Playwright smoke tag if UI changed. The `format:check` half is not optional — it is a ROOT script outside turbo, so "16/16 green" is true and silent about formatting. Confirm: no new table without RLS+test (sahoda-db) · every new AI action charges via withCredits (sahoda-ledger) · no raw hex · no console.log of tokens/PII · migrations untouched unless you are wt-db · pricing from config, not literals.
Then: small PR (<400 lines ideally), description = what/why/how-tested, request the reviewer subagent, append one LEARNINGS.md line (date · decision/gotcha). If a rule recurred twice, promote it into the package CLAUDE.md in the same PR.
