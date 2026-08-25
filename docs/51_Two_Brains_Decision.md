# 51 · Two brains — the founder's ruling, and what validation has to prove first

**25 August 2026.** A decision record, not a plan. **Nothing is to be built from
this file until validation is complete** (see the last section for what that
means and how it ends).

---

## The ruling

There are two brains, not one.

| | **Brand Brain** | **Marketing Brain** |
| --- | --- | --- |
| answers | who this business is | what works in marketing |
| holds | voice, persona, hook, red lines | corrections, outcomes, trends, competitor behaviour |
| source | the owner declared it | the product observed it |
| size | 15 fields | unbounded, accumulating |
| visible to the customer | yes, fully | **no, never directly** |
| how it changes | a person confirms each field | it learns |
| standard of truth | somebody vouched for this | this was measured |

A future assistant reads **both**. That is the CMO: someone who knows your brand
cold and also knows the craft — and those are two different kinds of knowing,
which is exactly why they are two different stores.

---

## Why this is better than the single-brain design in `docs/50`

`docs/50` recommended keeping Radar out of the Brain, because a brain that
learns your voice from your competitors converges on the market average, and
because a rival's page is somebody else's text. Both objections still stand —
**against putting it in the BRAND Brain.**

They do not apply to a store whose whole job is "what is happening in this
market". Competitor behaviour, category norms, seasonal patterns and platform
changes are marketing knowledge. They were homeless in the one-brain design and
had to be refused. Now they have somewhere to live, and the refusal narrows to
what it should always have been: **market knowledge must never be written into
brand identity.** The wall between the two brains is that sentence.

---

## The hard problem this creates, stated plainly

The Brand Brain is safe because **a person confirms every field.** That is the
whole guarantee, and the Marketing Brain cannot have it: the customer never sees
it, so nobody can confirm anything in it.

So it needs a different guarantee, and it needs one before a line is written:

1. **It may hold observations, never conclusions.** "This account's posts were
   edited 38% shorter on average, across 212 posts" is an observation with a
   count behind it. "This brand prefers punchy copy" is a conclusion, and a
   conclusion in a store nobody can see is a rumour the product believes about
   its own customer.
2. **Every row names what it was computed from.** If an output cannot be traced
   back to rows, the Marketing Brain did not supply it.
3. **It may never assert about the customer's own identity.** That is the Brand
   Brain's job, and the only writer to it is still a person pressing confirm. A
   learning that wants to change who the customer IS becomes a proposal on the
   `/loop` screen, exactly as today.
4. **Hidden is not unaccountable.** If it can shape output, somebody at Sahoda
   must be able to inspect it, and a customer must be able to ask why the
   product said something. A store that shapes what a business publishes and
   cannot be examined is a liability the first time it is wrong.

---

## The part that is a bigger moat than anything in `docs/50`

`docs/50` reasoned about ONE customer's corrections. A Marketing Brain can hold
patterns **across customers in the same trade**, which is an asset no single
customer can see and no competitor can assemble without the same customer base.
"Bakeries rewrite the resolver's opening line nine times in ten" is worth more
than any one bakery's corrections, and it improves the product for a customer
who has not corrected anything yet — which fixes the cold-start weakness the
per-customer design has on day one.

**It also carries the sharpest risk on this page.** Cross-customer means one
business's data improving another's output, and that is a privacy commitment
before it is an engineering task: aggregate patterns and counts only, never text,
never anything traceable to a workspace. The line has to be drawn before the
first row is written, because it cannot be drawn afterwards.

---

## What validation has to answer, and when the hold lifts

The hold exists because the whole design rests on one unmeasured assumption:
**that customers correct enough for corrections to be worth accumulating.**

Three questions, in order. The first is cheap and answers most of it.

1. **Do they correct at all?** How many resolved Brand Brain fields does a
   typical customer rewrite rather than confirm? How often is a publish rule
   overridden? Both are already on disk and need no schema change and no new
   capture. **If the answer is "they barely touch it", the corrections thesis
   dies here** — and the Marketing Brain should then be built from market and
   outcome data only, which is a different and smaller project.
2. **Does the signal predict anything?** Given a month of corrections, would
   applying them have made the next month's drafts need less editing? This needs
   drafts to be kept first, so it cannot be answered before question 1 justifies
   keeping them.
3. **Does anybody want the CMO?** The observation session in `docs/48`, plus one
   question asked directly: what would you want this thing to have learned about
   you by month three?

**The hold lifts when question 1 has a number.** Not before, and it does not
need questions 2 or 3 to be finished — it needs question 1 to say the thesis is
alive.

---

## Open, and owned by the founder

- Whether the two read-only reports that ANSWER question 1 are themselves
  covered by the build hold. They are the measuring instrument rather than the
  feature, they need no migration, and without them the hold has no end
  condition — but they are still code, so the call is not mine to make.
- What a learning may change in the Brand Brain (still one hidden field today).
- The cross-customer privacy line above.
- Whether the Marketing Brain is per-workspace, cross-customer, or both.

---

## What this file is not

It is not a design and it is not a plan. No schema, no tables, no interfaces,
and deliberately so: designing storage before question 1 has a number is how a
schema gets built around a guess. `docs/50` holds the reasoning about sources
and remains accurate; this file supersedes only its assumption that there is one
brain.
