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

## Not done

- Inbox attachments (images in DMs): the projector, an `inbox_message_attachments` migration and the renderer. Not started; the agent that owned it died before writing a line of it.
- Leads dedupe migration (unique partial index on the inbox conversation ref). Still advisory check-then-insert.

## Traps met

- Four implementation agents died at once (session rate limit until 23:40 IST; one auth drop). Their partial edits were on disk, compiled, and mostly tested; the finishing work was the buttons, the fetch-log binding, one mock and four fixtures.
- `git rm` stages a deletion; a later `git add <that path>` fails the whole add. The workflow deletion therefore rode the inbox commit.
- The shared worktree carries another session's dirty tree (assets, approvals, loop sweep, post_approvals migration). Nine failing tests in `lib/cron/loop-facts-sql` and `run-loop-honesty` are theirs.
