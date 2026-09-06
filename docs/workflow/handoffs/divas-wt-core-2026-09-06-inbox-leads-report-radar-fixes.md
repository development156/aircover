# Handoff — divas / wt-core (2026-09-06, the fix pass after the inbox/leads/report/radar audit, 20:30–21:20 IST)

**Done, pushed.** Four commits on wt-core, one per surface: `2b224d0b` inbox, `4a24b2a3` leads, `34f8e5f6` analytics + report, `4048c8d9` radar. Tip at push was `6ea80509` (another session's mesh fix on top). The founder's ask was "everything live and realtime, 10/10"; this is what code can do about it, and below is what only an environment or a platform can.

## What changed, per screen

| Screen | Now | Finding |
|---|---|---|
| /inbox | A stored thread with no connected account opens at `/inbox/threads/store/[id]` instead of a 404. A reply Zernio accepts is written to `inbox_messages` and the page revalidates on every outcome. Threads whose last word is the customer's say "Needs a reply". | IL-03, IL-10, IL-11 |
| /leads | Each card says when it arrived (workspace clock), which door it came through (site form / inbox / unrecorded) and links to the conversation when one exists. Status moves assert the row count; a refused move is reported, not shown as done. | IL-09 (advisory only), IL-19..22 |
| /analytics, /report | **Measure now** (free) runs the nightly metric pass for this workspace alone, ten minutes apart at most, and the line beside it says when Sahoda last asked. Same runner as `api/cron/metrics` (`metricCaptureDeps` gained `workspaceId`). | IL-26..30 |
| /radar | **Read now** on each watched business runs the weekly runner for that one competitor (same cap, same ledger keys, so a second press in the same week charges nothing). `radar_fetch_log` is read through the new `@sahoda/jobs/radar-log` entry and folded into the feed's `attempts`, so a page that refused every scan no longer looks like a quiet week. The weekly cron is now fail-closed (`SAHODA_RADAR_SCAN_MODE === 'on'`); `radar-nightly.yml` deleted. | IL-06, IL-23, IL-25 |

Tests: 65 web files / 809 tests across the four areas green before my additions; inbox 251, radar+leads+analytics+report+cron 661 green after. jobs radar + metrics 115 green. Design lint clean for my files.

## What this cannot make true, and who can

- **Inbox realtime** depends on Zernio delivering messages to the webhook. The subscription exists and fires; 99 of 168 events were unroutable because the account ids match no live connection. Reconnecting the Instagram/Facebook accounts on /connections is the customer-side fix.
- **The 24-hour reply window is Meta's rule**, not ours. After 24h only a HUMAN_AGENT-tagged reply is allowed, for 7 days; after that nothing. The product already offers the tagged reply; no code can extend it.
- **Radar needs `APIFY_TOKEN`** in the Vercel production env for Instagram sources, and **`SAHODA_RADAR_SCAN_MODE=on`** now that the pass is fail-closed. Without both, "Read now" reports "could not read" honestly and charges nothing.
- **Previews have no `SUPABASE_DB_URL`**, so Measure now and Read now fail soft there ("could not reach"); the attempts read returns empty and is reported to Sentry. Production has it.

## Verified live (build `2c664a42`, deployment `dpl_GJztuZTv5QK5gchY4NDWwYyfAv5y`, QA workspace 83bcafc4)

| Screen | What happened |
|---|---|
| /analytics | "Not measured yet · free" → pressed Measure now → "Nothing of yours has gone out live yet, so there was nothing to measure." |
| /report | "Measured less than a minute ago · free" on the next load; one button, same stamp. |
| /radar | Added a website watch, pressed Read now → "Sahoda read them just now. This is the first read, so there is nothing to compare it against yet."; row flipped to "READ 2026-09-06"; the feed showed "Checked QA probe site. Nothing changed" (the fetch-log binding rendering). Watch removed after; 5 credits spent from the QA workspace. |
| /inbox, /leads | Render, no dead `/inbox/threads//` links; both empty for the QA workspace, with the empty-state claims intact. |

Two build failures on the way: `6ea80509` and `4e481a84` failed js-budget because the Measure now island imported `ui/button` (+34 kB on two routes with no client code). Fixed in `2c664a42` with a plain button; the store route got its budget line. The Read now label lacked the number ("credits" alone), fixed in `870d86d2`.

## Second pass, 21:17–22:15 IST (founder: "two keys are in place, execute all the decisions")

| Done | Evidence |
|---|---|
| `inbox_messages.attachments` (jsonb) APPLIED to production; the store writer and reader had been using the column ahead of it, so every stored-thread read was answering 42703 | `ed3806b1`; PostgREST select on the column answers 200 |
| Photos and files in a thread render: images inline, other kinds as named links, every `src` through `/api/inbox/attachment`, which re-mints Meta's expiring DM media by message id and position after `scopedAccount` proves the account is the caller's | `ed3806b1`; 3 renderer tests, 2 reads tests, 1 projector test |
| `leads_one_per_conversation_idx` APPLIED to production (IL-09 closed by the database) plus the board index | `ed3806b1` |
| wt-core builds again: three routes over budget from the other session's approvals/planner work, accepted at the measured byte figures | `06338ff4`, `06e64dff` (the first wrote kB where the file holds bytes) |
| The reply-window sentence no longer says "HUMAN_AGENT" or "instagram thread" | `680c163e`; test pins the name and refuses the tag |
| **Inbox verified live on the one real Instagram account** (workspace 56d57400, QA user added as editor then removed): list, thread with three correctly attributed messages, a real comment on /inbox/comments, honest empty state on /inbox/reviews, reply box disabled with the reason | build `06e64dff`, deployment `dpl_3ft8a8cUyyS7TWVc3W6faD1E6YJe` |

**What the inbox pipeline actually holds (MEASURED 22:00 IST):** 0 webhook events in the last 36 hours; 5 active connections, of which ONE is a real messaging account (Instagram `testingg53`, a test account) with one conversation, last message 10 Aug; two LinkedIn (no DMs via Zernio) and two demo rows. The Zernio subscription is active and points at app.sahodalabs.com. So the inbox is quiet because nobody is writing to a connected account, not because a path is broken. Sending was not exercised: the only thread is past both Meta windows, which is exactly what the screen says.

## Not done

- A live send (free-form, tagged follow-up, failed send): no thread inside a window exists on any connected account. Needs a fresh DM to `testingg53` or a real customer account connected.
- Comment and review replies live: same reason.

## Traps met

- Four implementation agents died at once (session rate limit until 23:40 IST; one auth drop). Their partial edits were on disk, compiled, and mostly tested; the finishing work was the buttons, the fetch-log binding, one mock and four fixtures.
- `git rm` stages a deletion; a later `git add <that path>` fails the whole add. The workflow deletion therefore rode the inbox commit.
- The shared worktree carries another session's dirty tree (assets, approvals, loop sweep, post_approvals migration). Nine failing tests in `lib/cron/loop-facts-sql` and `run-loop-honesty` are theirs.
