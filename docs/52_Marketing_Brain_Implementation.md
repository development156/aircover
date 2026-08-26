# 52 · Implementing the Marketing Brain

**25 August 2026, research lane. A DESIGN. Nothing here is built, and nothing
starts until validation answers question 1 in `docs/51`.**

Visual version: the artifact published with this commit.

---

## The finding that sets the size of this

**It is not a new subsystem.** Both seams it needs already exist in this
codebase, each with working examples:

| seam | what exists | what is new |
| --- | --- | --- |
| **read**, at generation time | `packages/mesh/src/brand-context.ts` and `knowledge-context.ts` — same signature, same service-key fetch, same best-effort contract | one more file beside them |
| **write**, weekly | `/api/cron/loop`, which already collects a week of measurements and computes a learning | widen what it keeps |
| **propose** into the Brand Brain | `memory_events`, `propose_memory_event`, `/loop`, `resolve_memory_event` | nothing |
| **inspect** | `apps/web/src/app/admin` | one page |

Three new tables and one new provider is the whole of it.

---

## What a row holds, and why that is the decision that matters

The tempting shape is one document per workspace that a model writes prose into.
It is the fastest thing to build and the first thing to go wrong: a hidden store
of unsourced sentences about a customer's business, invisible to them and
uncorrectable by anyone.

So the store holds **typed observations, each carrying its evidence**:

```
kind           edit_length_delta
value          -38%
sample_size    212
window         2026-05-01 → 2026-08-25
computed_from  [212 row ids]
method         median char delta
```

The prototype already exists: `ChannelLearning` in `lib/loop/reflect.ts` carries
a metric, a lift, the post ids, a sample size and a window. Generalising that
shape IS the store.

**The test, and it is mechanical.** "Published posts run 38% shorter than the
drafts" is an observation — a count stands behind every word. "This brand
prefers punchy, direct copy" is a conclusion, and a conclusion does not go in
the store: it becomes a proposal in `memory_events`, where a person accepts or
rejects it. That is the existing machinery and it needs no change.

---

## Three tables

| table | scope | holds |
| --- | --- | --- |
| `marketing_observations` | one workspace | typed rows as above, append-only, recency-weighted on read |
| `marketing_patterns` | across customers | **counts only** — no text, no workspace ids, nothing emitted below a minimum number of contributing workspaces |
| `memory_events` | one workspace | unchanged; still the only route into the Brand Brain |

**The middle one is the biggest prize and the biggest risk.** What a whole trade
corrects is worth more than what one business corrects, and it helps a customer
who has corrected nothing yet, which is the cold-start fix. It is also one
customer's behaviour improving another's product, so the line belongs in the
schema and not in a policy document: counts and rates, never sentences, never
anything walkable back to a workspace, and nothing published off a handful of
accounts.

---

## Which brain speaks to which task

`docs/51` proposed "Brand has veto, Marketing has voice". That is a principle.
It becomes real by deciding, per task, which brain is in the prompt at all —
which is a line of code and a test rather than a judgement at runtime.

| task | Brand | Marketing | why |
| --- | --- | --- | --- |
| `plan_week` | governs | **leads** | timing, format and topic are marketing craft — this is the task the second brain exists for |
| `caption_rewrite` | governs | length and format only | voice is identity; Marketing may say "shorter", never "warmer" |
| `content_variants` | governs | format only | same reason, one layer down |
| `gate_classify` | **sole authority** | **never** | the gate is where "keep the brand original" is enforced; a brain arguing for reach has no business in it |
| the future assistant | governs | leads | both, and it must be able to say which one an answer came from |

**Marketing decides what to say and when. Brand decides how it sounds.** Every
row is that sentence applied to one task, and it is enforceable: a test asserts
the gate's prompt carries no marketing block, and it fails the day somebody adds
one.

---

## Four risks, and the design answer to each

| risk | the answer |
| --- | --- |
| it becomes a dumping ground | typed kinds — each new one a deliberate addition with a schema and a floor, never a free-text field |
| it speaks on thin data | every kind carries a minimum sample; `reflect.ts`'s floor is the model to copy, not to relax |
| it is wrong and invisible | provenance per row, an inspection page under the existing admin area, and the drift number from `docs/51` so degradation is a figure rather than a feeling |
| it costs a fortune | task-partitioned by the table above, capped the way library retrieval is, nothing below its floor included |

---

## Build order, after validation

1. **One kind, end to end.** The table, filled with the observation the weekly
   job already computes and currently discards. Nothing new measured, nothing
   reads it. Proves the pipe with arithmetic that is already trusted.
2. **The free kinds.** Gate overrides and Brand corrections, both computable
   from data on disk. Validation's numbers get their permanent home here.
3. **The read provider, one task only.** Copy an existing provider, wire it to
   `plan_week` alone, so any change in quality is attributable.
4. **Widen kinds, then tasks.** Draft deltas, inbox, leads — only once the
   draft-versus-published pair is kept.
5. **Cross-customer patterns.** Last, deliberately: biggest prize, and the one
   with a commitment attached.

---

## What this cannot tell you

Whether any of it helps. Every claim here is about where code would go and what
shape the data would take, and none of it is evidence that a Marketing Brain
makes output better. That is what steps 1 to 3 exist to find out, one task at a
time, and the hold in `docs/51` exists so that the first number arrives before
the schema does.
