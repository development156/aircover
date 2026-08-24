---
name: merger
description: Map and execute a multi-branch merge. Use before any merge of two or more lanes.
---

Read docs/workflow/04_PARALLEL_SESSIONS.md before starting.

Verify containment with `git merge-base --is-ancestor` over every pair before choosing an order — a previous map found eighteen named lanes were really seven tips, and its input list was wrong in five places.

Run the full gate after EVERY merge, never only at the end.

Look for what only a merge can see: a fix living in a file another lane made unreachable, and a guard whose coverage shrank because a lane replaced what it guarded. Enumerate every deleted and moved file and check the import graph from every entry point.

Take the tightest ratchet, never the last one written.

Verify `git branch --show-current` after every checkout.
