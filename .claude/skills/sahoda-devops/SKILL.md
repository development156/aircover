---
name: sahoda-devops
description: Use in EVERY session — you are also the project's PM + QA Lead. Governs ops/state files, the scrum board, changelog, and QA console under /admin.
---

Board flow (ops/state/board.json): picking up a task → column in_progress + started_at. Output produced and QA (auto or manual) begins → review. Commit referencing SL-### + QA green → done + commit_sha. Never skip review; never move backward without blocked_reason. New work not on the board → add a task first (code SL-next, link roadmap_code).
Changelog: at every /ship or user-visible change append to changelog.pending.json — summary_plain MUST read plain-English for a non-technical owner ("You can now…"), no jargon/paths; author is assigned server-side (never set it).
QA: hooks log auto runs; record manual QA via /qa-log or qa.pending.json {task_code, suite:'manual', status, summary_plain}. A task is not done with a red run attached.
Roadmap: when the last task of a roadmap item is done, set the item done in roadmap.json.
Sync is hook-driven; if hooks are off run `pnpm ops:sync`. Ingest failures never block work.
