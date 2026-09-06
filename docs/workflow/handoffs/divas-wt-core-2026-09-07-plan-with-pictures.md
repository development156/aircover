# Handoff — divas / wt-core (2026-09-07, plan my week with pictures, 23:10–00:40 IST)

**Shipped at `4a906245`, pushed. Verified end to end on a local server against the production database with the real image provider (the preview cannot run any paid action: no `SUPABASE_DB_URL` there).**

A box under Plan my week: "Also make a picture for each post". Ticked, the button reads "Plan my week with pictures · 50 credits" (20 for the plan plus up to five everyday pictures at the Studio's own price, read through `imageActionFor`, never a literal). After the drafts land, the week's pictures are made one by one from the screen and each is attached to its draft.

| File | What |
| --- | --- |
| `lib/studio/auto-settings.ts` | Chooses what a person at the Studio would: the first size every one of the post's channels accepts (`formatsForChannel`, the picker's own list), on-brand mode, the routed everyday model, the post's own words as the brief. 9 tests. |
| `app/actions/illustrate-post.ts` | One picture for one post through `queueGeneration` (every Studio gate, the hold and the debit are the Studio's), attaches the logo copy, signs a preview. 5 tests. |
| `components/planner/week-illustrator.tsx` | The cards: light sweep + breathing ring while a request is in flight, scale-in on arrival, a tick that pops; keyframes in globals.css, collapsed by the reduced-motion block. 4 tests. |
| `plan-week-panel.tsx`, `plan-week.ts`, `lib/planner/state.ts` | The box, the price, `postIds` on the plan result. |

**MEASURED, final run (local, QA workspace 83bcafc4):** plan in 19 s, 5 drafts, 20 credits; pictures at 43 s, 55 s, 76 s, 86 s, 98 s, all `1080 × 1080 · Square post` (both channels were X and GBP; the model returned 1024 × 1024, sniffed and stored as such), 6 credits each, toast "5 pictures attached · 30 credits used · 9 left"; balance 39 → 9.

**Three defects the live runs found, all fixed:** (1) React's dev double-mount tripped a closure cancel flag and the first card read "drawing" for ever over a picture that had been charged and attached; now a ref reset on effect entry. (2) One refused picture (PROVIDER_ERROR on a Google Business prompt, released, uncharged) stopped the whole week; now only an empty wallet or a deployment that cannot charge stops the run. (3) Another session's `next build` in this worktree wipes `.next` under a running dev server (500 on every route); wait for it, then start dev.

**QA wallet:** one ledger GRANT of 60 credits, actor `qa:divas:wt-core`, meta names this verification, applied through `app.apply_ledger_entry` over the pooler so the runs could complete. Balance left 9. All 20 planned posts, 8 assets and their storage objects deleted; generation rows stay (append-only history).

**Not done:** the picture is always the everyday model; a premium option on the box was not asked for. No e2e spec, because the paid path cannot run on the preview.

**Nothing needs a decision.**

Preview (the box and the price render; the paid path refuses honestly there): https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/planner
