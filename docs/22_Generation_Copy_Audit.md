# 22 — Generation Copy Audit

**Status: PREPARED, NOT APPLIED.** Nothing in this document has been changed in code.
Every item is a proposal with a named owner and a named file. It exists so the decision
can be made deliberately rather than inside a UI port.

Audited 2026-08-16 against `.agents/skills/humanizer` (33 patterns, from Wikipedia's
"Signs of AI writing"). Scope: the five prompts in `packages/mesh/src/tasks/` that put
words in front of a customer's audience.

---

## 0. The distinction this whole document rests on

Doc CLAUDE.md now records a ruling that em dashes stay in **Sahoda's own UI copy**,
because the reference design uses 542 of them and the humanizer's Voice Calibration says
a writing sample outranks its §14.

**That ruling does not extend to generated captions, and must not be read as if it does.**

Sahoda's UI copy is Sahoda's voice, and the reference is its sample. A caption published
to a customer's Instagram is the *customer's* voice, read by the customer's audience, who
have no idea Sahoda exists. There, an em dash is what it is everywhere else on the
internet in 2026: a reliable tell that a machine wrote the post. The two surfaces have
different authors, different readers, and therefore different rules.

This is the single most important thing to get right before any of the changes below are
applied.

---

## 1. What the prompts currently say about style

Nothing.

All five system prompts constrain **format** ("Output ONLY a JSON object", "No markdown,
no commentary") and **structure** (exact channel counts, exactly 5 briefs, six section
kinds). Not one of them constrains **voice** against a single one of the 33 patterns.

| task | file | style instruction present |
| --- | --- | --- |
| `content_variants` | `tasks/content-variants.ts:17` | "keep the core message and the brand voice" |
| `caption_rewrite` | `tasks/caption-rewrite.ts:19` | "read clearer and more on-brand" |
| `plan_week` | `tasks/plan-week.ts:49` | "ground every idea in the brand" |
| `site_generate` | `tasks/site-generate.ts:25` | "ground every line in the brand" |
| `brand_guidelines` | `tasks/brand-guidelines.ts:18` | none |

Every one of them delegates voice entirely to the Brand Brain's `voice` block. That is a
defensible design: the brand, not Sahoda, should decide how a brand sounds. It is also
why no generated caption has ever been told not to open with "Here's the thing."

---

## 2. Findings

### F1 — `hookify` instructs the model to manufacture a tell (HIGH)

`tasks/caption-rewrite.ts:16`

```
hookify: 'Rework the opening into a strong, scroll-stopping hook; keep the rest intact.'
```

"Scroll-stopping" is §4 promotional language, and it is in the instruction rather than the
output, which means it is not a drift the model fell into. It is the brief. A model asked
for a strong hook reaches for exactly the two patterns the skill names:

- §33 conversational rhetorical openers — "Honestly?", "Here's the thing", "Real talk"
- §31 manufactured punchlines — a run of clipped fragments engineered to land

**Proposed** (not applied): keep the intent, drop the words that summon the pattern.

> `hookify: 'Rework the opening so the first line earns the second; keep the rest intact. Do not open with a rhetorical question, a one-word hook, or a fake-candid aside.'`

Owner: mesh. Risk: low, single string, no schema change.

### F2 — the rule of three is in the schema, not the prose (HIGH, un-actionable here)

`tasks/brand-guidelines.ts:18` requires, in the output contract itself:

```
"signature_phrases": [string, string, string]
"core_values":       [string, string, string]
"sample_hooks":      [string, string, string]
```

Three fixed-length triads. §10 (rule-of-three overuse) is usually a tendency to correct;
here the contract mandates it. Every brand resolved by Sahoda gets exactly three
signature phrases and exactly three core values whether the founder's signals supported
two or five, and every caption written from that brain inherits the triad.

**This cannot be fixed in this lane and should not be.** The tuple lives in
`packages/shared` (frozen contracts, CLAUDE.md non-negotiable), it is stored in
`brand_memory.payload`, and loosening it to `string[]` is a contract change with a
migration behind it and every existing v1 brain to consider.

**Proposed:** file it as a shared-contract question, not a copy fix. The prior question is
whether "exactly three" was ever a product decision or just a convenient schema. Nobody
should relax it from inside a copy audit.

Owner: shared + db. Risk: high, contract and stored data.

### F3 — `site_generate` can fabricate testimonials (HIGH)

`tasks/site-generate.ts:28` lists `"testimonials"` among the six permitted section kinds,
and the prompt's only grounding instruction is "ground every line in the brand and the
goal". A brand has a voice; it does not have customer quotes. Asked for a testimonials
section, a model will write quotes and attribute them to people who do not exist.

This is not a humanizer pattern. It is the skill's hard rule ("Never invent facts") and it
is a product-integrity problem: a published site carrying invented five-star quotes is a
fabricated record, and the app's whole certainty vocabulary exists to prevent exactly
this class of claim.

**Proposed:** either drop `testimonials` from the permitted kinds until there is a real
source for quotes, or require the section to render `.is-proposed` and carry no attributed
names until a human supplies them. Prefer the first.

Owner: sites. Risk: medium, changes what a generated site contains.

### F4 — no anti-tell instruction reaches any caption (MEDIUM)

The patterns most likely to show up in a generated social caption, none of which any
prompt currently mentions:

| pattern | what it looks like in a caption |
| --- | --- |
| §14 em dash | "Fresh sourdough — baked at 4am — every single day." |
| §10 rule of three | "Fresh, local, and made with love." |
| §4 promotional | "Nestled in the heart of Pune." |
| §1 significance | "More than bread. A testament to craft." |
| §32 aphorism formula | "Sourdough is the language of patience." |
| §31 staccato drama | "No shortcuts. No additives. Just flour, water, salt." |
| §9 tailing negation | "Baked fresh daily, no exceptions." |

**Proposed:** one shared constant in mesh, appended to the system prompt of
`content_variants`, `caption_rewrite` and `plan_week` — the three tasks that produce
customer-audience prose. Not `brand_guidelines` (its output is internal structure, never
published) and not `site_generate` without F3 settled first.

Draft, for review rather than for pasting:

> Write the way a person running this business would write. No em dashes. Avoid
> three-item lists unless the three things are real. Do not open with a rhetorical
> question or a one-word hook. Do not call the business vibrant, nestled, renowned or a
> testament to anything. State what is true and stop.

Owner: mesh. Risk: medium — it constrains output that the Brand Brain's `voice` block
also constrains, so the two can disagree. See §3.

### F5 — `banned_phrases` already exists and is the better mechanism (MEDIUM)

`tasks/brand-guidelines.ts:23` already resolves a `voice.banned_phrases: string[]` per
brand, and it is already injected into every grounded task through `brand-context.ts`.

That is a strictly better home for most of F4 than a global constant: it is per-brand, the
founder can see and edit it on `/brain`, and it rides the existing injection path with no
new plumbing. A global rule that says "never say vibrant" is Sahoda overriding a brand
that may genuinely be vibrant.

**Proposed:** split F4 in two.

- The **mechanical** rules that no brand should ever want (em dashes, rhetorical-question
  openers) go in the shared constant.
- The **vocabulary** rules go into `banned_phrases` as a default seed at resolve time,
  where the founder can overrule them.

Owner: mesh + brain. Risk: low for the seed, and it makes F4 smaller.

---

## 3. The conflict that has to be resolved before anything is applied

F4 and F5 both constrain voice. The Brand Brain also constrains voice. Today the Brand
Brain is the only authority, and that is a deliberate design (doc 18 §2, "Brand Brain
decides everything").

Adding a global style rule to the system prompt puts a second authority in the room, and
the two can contradict each other on a real brand. A founder whose voice descriptor is
"punchy, dramatic, lots of short lines" has described §31 and asked for it on purpose.

Three options, in the order I would recommend them:

1. **Brand Brain wins, global rules are mechanical only.** Ship F5's split: only rules no
   brand would ever choose (em dash, fake-candid opener) go global, everything else is
   `banned_phrases` and therefore overridable. Smallest blast radius, keeps doc 18's
   ruling intact.
2. **Global rules win, brand overrides explicitly.** Ship F4 whole, and let a brand
   opt out through a new field. Needs a contract change; see F2 before adding fields here.
3. **Do nothing yet.** Defensible. No customer has reported a caption reading as
   AI-written, and this audit is a code read, not a measurement of live output. See §5.

---

## 4. Explicitly out of scope

**H3 — the emoji rule does not apply to caption generation.** §18 treats emoji as an AI
tell, and for encyclopedic prose it is. For an Instagram caption it is native register:
a bakery post with no emoji reads as stiffer and *less* human than one with two. No
proposal in this document adds an emoji restriction to any generation prompt, and none
should be added later by someone applying §18 mechanically.

**The em-dash ruling for UI copy** (CLAUDE.md, "Copy style") is about Sahoda's own
surfaces and is not reopened here. §0 explains why generated captions are the opposite
case.

**`packages/shared` schemas** are frozen contracts. F2 names one and deliberately stops.

---

## 5. What this audit did NOT do

It read prompts. It did not read output.

No generated caption was sampled, because generating one is an AI spend and the run that
produced this document was forbidden from triggering any generation. Every finding above
is therefore a claim about what the prompts *invite*, not a measurement of what the models
*produce*. A cheap model may well already write clean captions from these prompts; an
expensive one may already ignore them.

**The measurement worth taking before applying anything:** pull 20 real
`ai_provider_logs` rows for `content_variants` and `caption_rewrite`, count the seven
patterns in F4's table against the actual output, and apply only the ones that actually
show up. That is a half-day of reading and it would replace every "likely" in this
document with a number.

---

## 6. Summary

| # | finding | severity | owner | blocked by |
| --- | --- | --- | --- | --- |
| F1 | `hookify` briefs a promotional hook | HIGH | mesh | nothing |
| F2 | rule of three hard-coded in the schema | HIGH | shared + db | frozen contract |
| F3 | `site_generate` can fabricate testimonials | HIGH | sites | nothing |
| F4 | no anti-tell instruction reaches captions | MEDIUM | mesh | §3 decision |
| F5 | `banned_phrases` is the better mechanism | MEDIUM | mesh + brain | §3 decision |

F1 and F3 are independent of the §3 conflict and could ship on their own. F4 and F5 need
the authority question answered first. F2 is a question for whoever owns the contract, and
the right next step there is asking whether "exactly three" was ever intended.
