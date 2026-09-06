# Handoff — divas / wt-core (2026-09-06, content-ops wave 2, 20:30–22:20 IST)

**Landed and verified live at `719517d7` (build dpl_DvwzpZkfqVEdVGfVDBZ7spxJcW3q). Migration `20260906213000_content_ops_integrity` APPLIED to production in one transaction.**

The founder stopped the five implementer agents mid-wave ("finish fast"), then asked for everything implemented and working. The finished lib/DB/jobs work was kept, seven orphan tests for unbuilt UI were deleted, and the review round trip was wired to the screens in this session.

| Step, MEASURED headless on the preview | Result |
| --- | --- |
| /approvals row context | "09 Sept 2026, 10:00 am IST · Written by Sahoda · X: Not connected" + excerpt |
| Preview → comment | stored in `post_comments`, shown in the row |
| Send back on a dated draft | not offered (the RPC would refuse; fixed in 719517d7) |
| Planner → Send for review | "Sent for review." → queue badge "In review", "Sent for review by you" |
| Queue → Send back with reason | "Sent back to draft with your note." → `returned` row with the reason |
| Approve your own post | first press arms "Approve my own post", second press: "Approved and scheduled.", `approved_by` set |
| Composer | "Booked for 09 Sept 2026, 10:00 am IST", Send back to draft offered |

Also: a peer session's budget bump (06338ff4) wrote kB as bytes and the build stayed red; fixed in 06e64dff (and independently in 386b0080). The mint-ticket script prints the token and never writes `ticket2.txt`: redirect it, or every run reuses a dead ticket and Clerk says "This link has expired".

**Still open (scored as such in the artifact):** assets page-level cap notice, folder counts, URL state; planner month navigation, day columns, focus return; menu semantics; revision diff; the apps/jobs doctrine sentence + allowlist test.

**QA workspace:** the wave-2 post, its approvals and comments deleted. One post `a681a2c4` remains that this session did not create.

**Nothing needs a decision.** `return_post_to_draft` walks scheduled variants back to pending, by my ruling.

Preview: https://sahodalabs-git-wt-core-development-4417s-projects.vercel.app/approvals
