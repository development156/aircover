# 46 · Brand Brain audit

**25 August 2026, research lane, at `c44f9e5`.** A source trace: what reaches the
Brand Brain, what reads it, what the knowledge library does, and why it cannot
accumulate yet. Every count is a count of CODE. No live resolve was run and no
production row was sampled.

Rendered version: the artifact published with this commit.

---

## The two findings that matter

**A person answers six screens and four values reach the model.** Fifteen Brand
Brain fields are resolved from those four, and two of the four come from a page
fetch that can fail.

**Nothing feeds it afterwards.** All three writers are a person pressing a
button. `apps/jobs` — the Loop, the metric collectors, Radar — contains no
reference to the Brand Brain at all. The accumulation you are describing has no
mechanism.

---

## Q1 · How onboarding reaches the Brain

The store holds **18** fields after six screens. `use-build.ts` reads **9** of
them: `name`, `what`, `category`, `audience`, `colors`, `colorsTouched`,
`sources`, `sourceUrls`, `competitors`. The last three are new this week and go
to the knowledge library and the Radar watch list, not to the Brain; colours go
to the workspace theme.

**Never leaves the browser:** `age`, `loc`, `role`, `interests` (all of screen
04), `logo`, `refs`, `refNote`, `docs`. `docs` holds a filename and a byte count
and never the file.

`toResolveInput` fills **4 of 23** `ResolveInput` slots:

| slot                | from                                        | reliability                |
| ------------------- | ------------------------------------------- | -------------------------- |
| `source.name`       | typed name, or the workspace name           | always                     |
| `source.category`   | a phrase built from three enums             | always                     |
| `source.one_liner`  | first real sentence of the fetched page     | only if the site read worked |
| `brand.proof_point` | first sentence of that page with a number   | only if the site read worked |
| `taboo.avoid_topics`| the refusal field                           | **always empty**           |

**The refusal is hardcoded.** `use-build.ts` sets `form.set('refusal', '')`, so
`taboo.avoid_topics` is empty on every resolve and every Red line is invented
with nothing from the user behind it.

**The positioning sentence never reaches the model.** Screen 02's text, the
category chip and the audience sentence are joined and handed to a lexicon
classifier, which returns three enums that become a phrase like "local presence
in food, in India". The person's own words are read for keywords and discarded.
With a failed site read, fifteen fields are written from a name and that phrase.

---

## Q2 · What consumes the Brain

Four mesh tasks declare `cachePrefix: 'brand_context'`:

| task              | brain   | reached from                          |
| ----------------- | ------- | ------------------------------------- |
| `caption_rewrite` | yes     | inline rewrite, composer AI, remix    |
| `content_variants`| yes     | composer AI, remix                    |
| `plan_week`       | yes     | planner, home rail, the Loop          |
| `site_generate`   | yes     | Sites                                 |
| `gate_classify`   | refused | the compliance gate                   |
| `brand_extract`   | refused | signup, resolve from library          |
| `image_generate`  | no      | image generation                      |

**Both refusals are correct and should stay.** The gate's own comment: the Brain
is what the post was written from, so handing it to the checker asks the same
document to be both the argument and the judge. `brand_extract` runs before a
Brain exists.

The CMO report, Campaigns, Playbooks, Inbox and Analytics call no model task
directly. **Image generation is the one clear omission** — brand-facing output
with no knowledge of the brand.

---

## Q3 · How Knowledge is processed

`addUrlDocument`, `addPdfDocument` and `addTypedDocument` all land in
`createThenIndex`: parse, chunk, write to `knowledge_documents` and
`knowledge_chunks`. Both tables are read-only to members under RLS and five
Postgres functions are the only write path. Nothing costs a credit because
nothing calls a model.

**`packages/mesh` has zero references to knowledge.** No caption, variant, weekly
plan or site is grounded in an uploaded document.

**One bridge exists:** `resolveFromLibrary` on `/brain/resolve` reads current
passages and runs `brand_extract` over them, charged as brand research. Manual,
paid, and the only route from a document to the Brain.

**A promise no code keeps.** The Knowledge screen says "A post that names a price
uses one from here, or it does not name one." Nothing links a post's price to the
library — no reference to knowledge in the composer, the posts library or the
gate.

---

## Q4 · Why it cannot be a moat yet

| writer                 | trigger                        | source   |
| ---------------------- | ------------------------------ | -------- |
| onboarding build       | a person finishing onboarding  | resolved |
| resolve console        | a person pressing resolve      | manual   |
| field confirm or edit  | a person on `/brain`           | manual   |

The version history is real and append-only, so the machinery for accumulation
exists. Nothing puts anything into it. The hidden, months-of-use layer does not
exist in any form — not as an empty table waiting to fill.

---

## Ranked repairs

1. **Send the answers already collected.** Age, location, role and interests map
   onto `customer.description`; the positioning sentence belongs in
   `source.mission` alongside the classifier's phrase rather than instead of it.
   One function, roughly triples what the model is told. — research lane, hours.
2. **Ask for the refusal again, or stop shipping an empty slot.** Owner ruling.
3. **Make the Knowledge price sentence true, or remove it.** Removing is minutes.
4. **Feed the library into `caption_rewrite` and `content_variants`.** The
   retrieval already exists. Biggest available lift in output quality. — days.
5. **Give the Brain a writer that is not a person.** A weekly job proposing Brain
   updates from what happened, as guesses to confirm, using the certainty
   machinery already on the screen. — advisor, a project.
6. **Decide what the hidden layer is.** No schema, no table, no writer. A product
   decision before an engineering one. — owner.

---

## What this audit cannot see

A source trace of `apps/web`, `apps/jobs`, `packages/mesh`, `packages/shared` and
the migrations, followed by hand and by grep. A path reaching the Brain or the
library through a helper not named here is not covered. No live resolve, no
production row. Counts measured at `c44f9e5` and will drift.
