# LEARNINGS — SAHODA LABS

2026-07-18 · Day 0 — repo config laid down.
2026-07-18 · pricing.config.json — source doc §9 ships malformed JSON (`rollover_cap_x` was trapped inside the `currency_note` string, so the trailing `: 2` broke parsing). Fixed in-repo by closing the string after `agency 15000` and promoting `rollover_cap_x` to a real numeric key (2); all pricing numbers unchanged. TODO: fix doc §9 upstream too.
