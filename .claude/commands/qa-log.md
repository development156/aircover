---
description: Record a manual QA run against a card (doc 13 §11).
argument-hint: SL-12 pass|fail "plain summary" [suite]
---

Run `node scripts/ops-card.mjs qa $ARGUMENTS`. Appends to `ops/state/qa.pending.json` and syncs.

Hooks already log the automatic runs — typecheck, lint, unit, rls, smoke — so this is for what a machine cannot see: a screen you actually looked at, a flow you actually walked. Write `summary_plain` as what you checked and what you saw, not "works". Record a `fail` as readily as a `pass`; a red run pins to the top of the console and blocks its card from Done, which is the point of having it. Screenshots attach in the QA console, not from here.
