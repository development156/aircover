# 53 — Marketing Brain: integration audit

Status: research. Nothing here is built. The founder's hold stands: **do not build
anything until the validation is complete** (see docs/50, docs/51, docs/52).

Audited against this codebase on 25 August 2026 from the lane
`claude/lead-research-tz63ld`: all tables, the four cron routes, the two shipped
mesh context providers, the evidence component, the report page and the admin area.

Visual companion (same content, designed): the "Most of It Already Exists" artifact.

## The question

"Audit everything and come up with ways how we can integrate and perform Marketing
Brain in our platform. See what's already compatible to plug in and what new things
need to be built."

## Headline

Fifteen pieces are already in the product. Three of them are producing exactly the
right data today and sending it to one screen. Six pieces are genuinely new, and
only one of those is a migration.

## The three surprises

1. **`competitor_changes` already stores typed market observations.** The column
   shape is `change_kind text check (change_kind in ('new_posts','audience_moved','page_content'))`,
   `day_span int`, `summary text check (length(btrim(summary)) between 1 and 500)`.
   That is the Marketing Brain's row shape, written weekly, rendered only on Radar.
2. **`audience_snapshots` preserves follower and engaged history per channel**, and
   deliberately carries no FK to `connections` because those measurements cannot be
   re-fetched. The history the Marketing Brain needs is already being protected.
3. **The CMO Report page already renders the job description** — sub-title "The
   Monday read: what last week did, what Sahoda learned from it, and what it plans
   to do next." The surface exists and is under-fed.

## What plugs in (15)

| Piece | What it gives the Marketing Brain | Work |
| --- | --- | --- |
| Radar changes | Typed competitor and market movement, already summarised | read it |
| Post metrics | What performed, captured nightly | read it |
| Audience history | Follower and engaged trend per channel | read it |
| Publish logs | Every gate verdict, quote and suggested rewrite | read it |
| Brain history | Which guesses were rewritten, and to what | read it |
| Inbox messages | What customers say, in their words | read it |
| Lead messages | What prospects ask before buying | read it |
| The Sunday cron | A weekly slot that already collects and computes | widen it |
| The reflect floor | A refusal to speak on thin data, already written | reuse it |
| Proposal queue | The only sanctioned route into the Brand Brain | reuse it |
| Context providers | Two shipped examples of a read-before-the-model-call | copy one |
| The CMO Report | A page already built to speak in this voice | feed it |
| Evidence component | A shipped pattern for "here is where this came from" | extend it |
| Admin area | Somewhere to inspect a hidden store | add a page |
| Credits and pricing | Charging, cost preview and the spend ledger | reuse it |

## What is genuinely new (6)

| New piece | Why it cannot be borrowed | Size |
| --- | --- | --- |
| The observations table | Nothing today stores a typed, evidenced marketing fact | one migration |
| Observation computers | One small function per kind, each with its own floor | incremental |
| The read provider | Copy of an existing file, pointed at the new table | one file |
| Draft capture | The edit currently overwrites the draft — nothing to read | blocking |
| The proof line | Evidence shown beside a suggestion, not just a Brain field | component |
| Cross-customer patterns | No aggregate store exists, and it carries a privacy line | last, deliberately |

**Draft capture is the one that gets more expensive every day.** The rewrite history
that moments 01 and 03 depend on is being destroyed now (REQUESTS.md §22).

## The six moments that beat an agency

An agency has judgement, taste and a person who answers the phone. Sahoda will not
win on those. It wins on four things no agency can do at any price: it read
everything, it counted everything, it never forgets, and it costs nothing to ask.

1. **Every suggestion carries its receipt.** "Your last 6 posts that opened with a
   question got 3.1× the saves of the 14 that opened with a statement."
2. **It noticed something you did not.** "You have stopped using exclamation marks.
   Twelve in April, none since June." Pure arithmetic, no model call.
3. **The improvement receipt.** "In May you rewrote 62% of what Sahoda drafted. This
   month, 24%." The honest measure: if it does not fall, the product says so.
4. **It brings things up unasked.** "You have not mentioned the tasting menu in 11
   weeks. It is your strongest performer."
5. **It remembers the decision you made.** "Not suggesting a discount post — you told
   Sahoda never to discount, in March."
6. **The one an agency cannot say.** "Bakeries that post before 9am get 2.4× the
   saves. You post at 2pm." An agency has a dozen clients; Sahoda has the cohort.

The pattern under all six: specific, instant, and evidenced. An agency can be
specific if you pay for the analysis and evidenced if you wait for the deck. It can
never be all three at once, on a Tuesday, for free, about a caption you are writing
right now. None of the six needs a chatbot; a chatbot is a nicer way to ask for them.

The example sentences above are shapes, not copy. Real wording goes through the copy
rules in the root CLAUDE.md like everything else.

## Build order, when the hold lifts

1. **Moment 02 with no table at all** — arithmetic over published post text. Smallest
   end-to-end proof that an observation can be computed, evidenced and read as
   impressive rather than creepy.
2. **The table, filled from what already runs** — one migration, the Sunday cron, and
   the admin page in the same change so the store is never unobservable.
3. **The read provider wired to one task only** (`plan_week`), so any effect is
   attributable.
4. **Draft capture, then moments 01 and 03.**
5. **The cohort line last** — strongest claim, hardest to walk back, privacy
   constraint in the schema rather than in a policy.

## Open decisions for the founder

- Are the two read-only validation reports inside the build hold?
- Is Brand-has-veto the arbitration rule when the two brains disagree?
- When does this lane merge into `wt-core`?
