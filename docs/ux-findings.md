# UX findings

The input list for the UX audit. One entry per finding: where it lives, and **what a
user experiences** — not what the code does. A finding is only useful here if it can be
stated as something a person saw or would see.

Findings 1–4 are the duplicate-channel family, all **fixed**. They are recorded together
because they are one defect that moved three times, and the shape of that movement is the
thing the audit should be looking for elsewhere: a guarantee held by convention in each
consumer instead of once at the boundary.

Status: `FIXED` · `OPEN` · `WATCH` (fixed, but the class is worth re-checking).

---

## 1. The schedule picker promised a post would go out when nothing could receive it

**Where:** `apps/web/src/lib/posts/connection-gap.ts:78` (`someChannelStillConnected`)
**Status:** FIXED
**What a user experiences:** They pick LinkedIn, set a time, and the picker says
"This goes out on its own at around that time." LinkedIn is not connected. Nothing goes
out, and nothing tells them so — they find out by the post never appearing.

The condition "is any channel still connected" was derived as
`unconnectedNames.length >= totalChannels`. For `['linkedin','linkedin']` that is
`1 >= 2` — false — so the picker took the optimistic branch. The parameter is now stated
by the caller rather than inferred from a length.

---

## 2. The same warning named one broken account twice

**Where:** `apps/web/src/lib/posts/connection-gap.ts:36` (`unconnectedFrom`) · fixed in `5b84e34`
**Status:** FIXED
**What a user experiences:** "Nothing goes out at that time — LinkedIn and LinkedIn
aren't connected." They go looking for a second LinkedIn account they never connected,
because the sentence names two and uses a plural verb for one broken channel.

Finding 1's fix corrected the boolean and left the NAME LIST undeduplicated — the same
defect, one line over.

---

## 3. A repeated connected channel rendered two identical Publish buttons

**Where:** `apps/web/src/components/posts/publish-now.tsx:97` (`onRail`) · fixed in `e31fee1`
**Status:** FIXED — **shipped to production**
**What a user experiences:** Two "Publish to X" buttons stacked under one post, with no
way to tell them apart. Pressing either publishes once; pressing both is an attempt to
publish the same post twice. React also logged "Encountered two children with the same
key", so the second button's state could attach to the first.

`PublishNow` splits its channels into a button rail and a warning. The warning went
through `unconnectedFrom` (which deduplicated); the rail read the raw array. One shared
input, two branches, one guard.

---

## 4. ROOT CAUSE — `posts.channels` is a `text[]` that every consumer reads as a set

**Where:** `packages/shared/src/db/content.ts:26` (`PostSchema.channels`)
**Status:** FIXED at the boundary — `packages/shared/src/db/channel-set.ts:65`
**What a user experiences:** Nothing directly. This is the reason findings 1–3 exist and
the reason each fix only held for a day: the column has no unique constraint, the planner
and the editor write it untouched, and each consumer was left to defend itself. Three
consumers, three private `[...new Set(...)]` guards, and every gap between them was a
shipped bug.

Fixed by deduplicating **once**, when the row is parsed: `channels` is now a `ChannelSet`
— a branded readonly array that only `toChannelSet` can produce. A consumer that wants a
set can no longer be handed a raw array by a caller who forgot, and the four component-local
guards are gone (`post-card.tsx:82`, `planner-row.tsx:55`, `publish-now.tsx:97`,
`connection-gap.ts:36`).

Proven by mutation: removing the `new Set` from `toChannelSet` fails eight named tests
across all three failure modes —

| failure mode | test |
| --- | --- |
| count-based wording | `a duplicated channel cannot turn "nothing goes out" into "it goes out"` |
| rendered names | `a channel repeated in post.channels is named ONCE, in the singular` |
| React keys | `a repeated CONNECTED channel offers one button, not two identical ones` |
| React keys | `renders ONE chip on the posts list, not two destinations` |

---

## What the audit should carry forward from 1–4

Three questions to ask of every finding, because these are what made one defect into four:

1. **Is the guarantee held once, or once per consumer?** A rule enforced by convention in
   each reader is a rule that will be missing from the next reader.
2. **Which siblings read the same input?** Every fix here closed the reported consumer while
   a sibling kept reading the raw value. Count-based wording, rendered names and React keys
   are three different symptoms of one cause, and they are reported as three different bugs.
3. **Does the test assert the branch, or the sentence the user reads?** Findings 1 and 2
   both had passing tests. They asserted the boolean, not the copy on screen.
