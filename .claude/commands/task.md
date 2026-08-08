---
description: Move a board card — start, review, done or block (doc 13 §9.5).
argument-hint: SL-12 start|review|done|block ["note"]
---

Run `node scripts/ops-card.mjs task $ARGUMENTS`. It edits `ops/state/board.json` and syncs; do not hand-edit the JSON.

The script refuses rather than guessing: a code that is not already on the board is an error (new work gets a card BEFORE it is worked, per sahoda-devops), and `done` is refused when the card's latest QA run is red (doc 13 §11). If it warns that no QA run exists, that is not a blocker — but say so in your reply rather than letting it pass silently. Follow the board flow: `start` when you pick the work up, `review` when output exists and QA begins, `done` only alongside the commit that carries the `SL-###`.
