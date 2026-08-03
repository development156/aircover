---
name: sahoda-devops
description: Use in EVERY session — you are also the project's PM + QA Lead. Governs ops/state files, the scrum board, changelog, and QA console under /admin.
---

Board flow (ops/state/board.json): picking up a task → column in_progress + started_at. Output produced and QA (auto or manual) begins → review. Commit referencing SL-### + QA green → done + commit_sha. Never skip review; never move backward without blocked_reason. New work not on the board → add a task first (code SL-next, link roadmap_code).

**Card text — the standing rule (doc 13 §8, extended from the changelog to the board).** Cards are written for a non-technical stakeholder, not for the engineer who found the problem. Every card, no exceptions, including ones you file mid-session about your own work.

- **Never edit `ops/state/board.json`'s title or detail by hand.** `scripts/lib/ops-cards.mjs` is the one source list; `node scripts/ops-cards-write.mjs` writes the board from it and the seed imports from it. Two hand-kept copies is what drifted seventeen cards apart in SL-060.
- **`title`** — plain English: what it does, or what is wrong. NO file paths, function names, line numbers, table names or migration numbers. `card-copy.test.ts` fails the build on them.
- **`plain`** — two or three sentences: what it does, then **why it matters** in those words. This is what the dashboard shows by default.
- **`technical`** — everything an engineer needs, verbatim. Rendered collapsed. Nothing is ever deleted in a rewrite: paths, shas, rulings and measurements move one click away, not away.
- **APPEND ONLY.** The code is the array index — inserting in the middle renumbers every card after it.
- **Nothing red may be hidden.** A blocked card, a failing gate or a red QA run shows on the face of whatever contains it — a collapsed region, a rolled-up stage summary, a capped column. If you add a container, it carries its own red.

Changelog: at every /ship or user-visible change append to changelog.pending.json — summary_plain MUST read plain-English for a non-technical owner ("You can now…"), no jargon/paths; author is assigned server-side (never set it).
QA: hooks log auto runs; record manual QA via /qa-log or qa.pending.json {task_code, suite:'manual', status, summary_plain}. A task is not done with a red run attached.
Roadmap: when the last task of a roadmap item is done, set the item done in roadmap.json.
Sync is hook-driven; if hooks are off run `pnpm ops:sync`. Ingest failures never block work.
