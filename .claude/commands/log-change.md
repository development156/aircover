---
description: Queue a plain-English changelog entry (doc 13 §8).
argument-hint: "title" "plain summary" [added|changed|fixed|removed|security|docs] [SL-11,SL-12]
---

Run `node scripts/ops-card.mjs change $ARGUMENTS`. Appends to `ops/state/changelog.pending.json` and syncs.

`summary_plain` is written for a non-technical product owner and is the only part most people will read: "You can now…", "Fixed a bug where…". No jargon, no file paths, no ticket numbers. The script rejects the obvious slips, but it cannot tell a technical sentence from a plain one — that judgement is yours. Put the technical detail in `details_tech` afterwards if it matters.

Pass the card codes as the fourth argument — they are not scraped from the summary, because a summary written for a non-technical owner should not contain ticket numbers in the first place. Unlinked entries make the `/ship` changelog check vacuous.

Never set the author. The rotation — DIVAS → GIRIJA → DIVAS AND GIRIJA — is assigned server-side from the changelog sequence so it stays deterministic no matter who or what writes the entry, and there is no field on the payload through which a client could override it.
