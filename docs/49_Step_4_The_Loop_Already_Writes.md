# 49 · Step 4 — the writer already exists, and it has one sentence to say

**25 August 2026, research lane, at `a40ffd7`.** Step 4 of the `docs/46`
repairs, which was scoped as "give the Brain a writer that is not a person — a
weekly job proposing Brain updates from what happened, as guesses, confirmed
with the certainty machinery already on the screen".

**All of that is built.** Every part of it. This file is what was found instead,
and it corrects `docs/46`, which said the opposite.

---

## What actually exists

| piece                                            | where                                            |
| ------------------------------------------------ | ------------------------------------------------ |
| the proposal queue                               | `memory_events`, migrated 18 July                 |
| a job computing learnings from real measurements | `lib/loop/reflect.ts`                             |
| the write into the queue                         | `store.proposeLearning` → `status = 'pending'`    |
| a second writer, for library-derived suggestions | `public.propose_memory_event`                     |
| a screen showing what is pending                 | `/loop`, in the sidebar                           |
| accept and reject                                | `public.resolve_memory_event`                     |
| accept writing a new brain version               | deep-merges the patch, `source = 'system'`        |
| the weekly trigger                               | Vercel cron, `0 21 * * 0`                         |

The audit missed the fourth `brand_memory` writer because it grepped TypeScript
and that writer is a Postgres function. A detector inherits the blind spot of
the code it audits.

The shape is also right, and better than the step-4 sketch asked for. A learning
is arithmetic, not a model call — `reflect.ts` imports no mesh, holds no port,
and cannot reach a provider, so it is structurally incapable of inventing a
claim about the customer's business. A learning without evidence is refused by
the schema. Accept is a person's click and nothing else.

**So step 4 is not a build. It is three reasons this has never once run to
completion, and each has a different owner.**

---

## Reason 1 · The cron defaults off, on purpose

`loopCronEnabled()` returns true only for the exact string `on` in
`SAHODA_LOOP_CRON_MODE`. The reasoning in that file is sound and should not be
reversed casually: a cycle spends **20 credits per workspace per week** before
anybody has seen anything, so a default of on would mean the deploy that added
the schedule silently started charging every workspace in the database.

**This lane cannot read production environment variables.** If that value is not
exactly `on` today, the Sunday cron has fired every week and returned without
starting a cycle, and no amount of the rest of this file matters.

**Check that first.** It is one environment variable and it decides whether the
other two reasons are even reachable. Owner: whoever holds the Vercel project.

---

## Reason 2 · The evidence floor is higher than any customer's data

`reflect.ts` puts four gates in front of a learning, and they are good gates:

| gate                    | value | what it stops                                            |
| ----------------------- | ----- | -------------------------------------------------------- |
| `MIN_POSTS_PER_GROUP`   | 3     | one unusual afternoon reading as a channel's performance   |
| `MIN_GROUPS`            | 2     | a single group being described as a comparison             |
| `MIN_LIFT`              | 0.25  | platform reporting noise reading as a difference           |
| `MIN_LEADER_MEAN`       | 10    | "3 impressions against 1" reading as a three-fold lift     |

The file records the live production data beside them: **instagram 5 posts with
impressions of 1 to 3, linkedin 1 post at 63.** Against those gates, linkedin
has one post where three are needed, so exactly one group qualifies, so there is
no comparison to make. The result is `single_group` and no learning, every week,
correctly.

This is not a bug and the floor must not be lowered to make something appear.
Learning is gated on **publishing volume**, not on engineering: three posts on
each of two channels, with a real gap between them. Nothing in the codebase
brings that date closer.

---

## Reason 3 · One sentence, into a field nothing can confirm

This is the one that actually undercuts the moat, and it is the smallest line of
code in the whole feature. Every learning the Loop can produce carries the same
patch:

```ts
patch: { alignment: { note: `${learning.leader} is currently your strongest channel.` } }
```

`run-loop.ts:288`. One field. Deep-merged, so each accepted learning **replaces**
the previous sentence rather than adding to anything.

And `alignment.note` is in neither `BRAIN_FIELDS` nor `DERIVED_FIELDS`. It is
rendered on the derived card and it is not editable, not confirmable, and not
counted by the ring. So the step-4 premise — "as guesses, confirmed with the same
buttons that now exist" — **is false as built.** The accept happens on `/loop`,
and the field it lands in has no Confirm beside it because the confirmation
machinery does not know that field exists.

Months of use, today, accumulate into one overwritten sentence about which
channel is doing better.

**This is the piece worth designing**, and it is a product decision before an
engineering one, which is the same place `docs/46` left question 6. What should
a year of watching a business actually deposit? Until that is answered, adding
more patch targets is guessing at a schema.

---

## The one small gap this lane could close, and cannot

`reflect()` distinguishes five reasons for having nothing to say — `no_history`,
`too_few_posts`, `single_group`, `difference_too_small`, `numbers_too_small`.
`loop_cycles` stores exactly one of them, as the boolean
`reflect_skipped_no_history`. **The other four are computed every Sunday and
thrown away**, so the product cannot tell an owner why it had nothing to say,
and neither can we.

That is precisely the discipline `lib/inbox/emptiness.ts` exists to enforce
elsewhere — eight kinds of nothing kept apart because "we never asked" and "we
asked and got nothing" are different sentences. Here five collapse into one
boolean.

Storing the reason needs a column on `loop_cycles`, which is a migration, which
only the db lane writes. Recorded as `apps/web/REQUESTS.md` §21.

---

## What step 4 becomes

1. **Read `SAHODA_LOOP_CRON_MODE` in production.** One variable. Owner: Vercel
   project holder. Everything else waits on the answer.
2. **Decide what a learning may write**, beyond one sentence in
   `alignment.note`. Owner: founder. This is the moat question and it has never
   been answered, which is why the field list is one item long.
3. **Give the accepted learning a home the confirmation machinery can see** —
   either `alignment.note` joins `BRAIN_FIELDS`, or learnings write somewhere
   that is already in it. Small, once decision 2 is made. Advisor review.
4. **Store the reflect reason** (REQUESTS §21). Db lane.

None of it is the weekly job, because the weekly job is written.

---

## What this file cannot see

Production. Not the env var, not a single `memory_events` row, not whether a
cycle has ever opened. Every claim above is read from source and from the two
migrations, and the live half needs somebody with the Vercel and Supabase
consoles open. The `reflect.ts` header's production figures are quoted from that
file and were measured by whoever wrote it, not by me.
