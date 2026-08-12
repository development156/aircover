# 18 — Brand Brain

**Written:** 12 August 2026
**Supersedes:** the Compendium's Part III Component 01, where the two disagree.
The Compendium's Parts I and II stand.
**Grounded in:** `wt-web` @ `21949e9`, live in production.

This is the build spec. It merges the Compendium's design thinking with the
architecture research, and corrects both against what the codebase actually
does today.

---

## 0. Two corrections before anything else

**Firecrawl does not run through OpenRouter.** OpenRouter routes LLM inference
and offers web *search* via a plugin. Firecrawl's crawl, scrape and extract are
a separate service with its own API and its own key. That is a direct
integration, not a mesh route.

This is good news. It's simpler, it's priced per-call (which passes the vendor
rule — rent execution, own judgment), and it keeps a scraping failure from
looking like a model failure.

**"Playbooks" is already taken.** The Compendium uses it for a roadmap feature
and for content repertoires per business model. Knowledge files are called
**Packs** here — the Compendium already says "cultural pack", so the word is
consistent with existing vocabulary and collides with nothing.

---

## 1. What Brand Brain is

> **A versioned record of what a business is, what it may never say, and where
> it belongs — that every piece of generated output must ground in, and that a
> deterministic gate enforces before anything reaches the world.**

Two halves, and the second is the one that earns the money:

- **The visible half:** voice, audience, promise, proof. Makes captions sound
  like them.
- **The load-bearing half:** red lines, regime, cultural constraints, and the
  willingness to refuse. Makes the product defensible to a brand with something
  to lose.

The Compendium's line is the right one and should govern every design argument:
**knowing what a business must never say matters more than knowing how it likes
to sound.**

---

## 2. The trust boundary — the most important decision in this document

The founder's instruction is that Brand Brain should be the core operator, able
to drive Zernio, Trigger.dev, credits, and everything else. **That instinct is
right about scope and must be wrong about mechanism**, for one reason:

Brand Brain reads customer-supplied content. A scraped website, an uploaded
brand book, a filled worksheet, an inbox message from a stranger. The moment
that content shares a context window with something that can publish, a line of
text in a PDF becomes an instruction.

This is not theoretical caution. A 2025 joint OpenAI / Anthropic / Google
DeepMind team bypassed twelve published prompt-injection defenses with over 90%
success — and most of those defenses had originally reported near-zero. There is
no prompting technique that closes this.

### The resolution: Brand Brain decides everything. Code does everything.

| | Brand Brain | Code |
|---|---|---|
| Chooses what to post | ✅ | |
| Chooses when | ✅ | |
| Writes the caption | ✅ | |
| Decides which channels | ✅ | |
| Proposes the week | ✅ | |
| **Calls Zernio** | ❌ | ✅ |
| **Spends credits** | ❌ | ✅ |
| **Enforces red lines** | ❌ | ✅ |
| **Sends anything external** | ❌ | ✅ |

Brand Brain proposes a complete, specific plan. Code validates it against the
deterministic gate, then executes. **Nothing the model emits reaches the world
without passing a check the model cannot influence.**

This is the same discipline the codebase already learned three times this month:
a guard living only in the application layer disappears the first time someone
calls the database directly. `assert_account_for_scheduled_post` takes no
workspace argument because an absent parameter cannot be forged.

### Two paths, never joined

```
TRUSTED PATH                          QUARANTINE PATH
system prompt                         scraped websites
Packs (we authored these)             uploaded PDFs
brand_memory (confirmed fields)       filled worksheets
                                      inbox messages
        │                                     │
        │                                     ▼
        │                          quarantined model call
        │                          ── no tool access
        │                          ── delimited + provenance-tagged
        │                          ── output is DATA, never instruction
        │                                     │
        │                                     ▼
        │                          extracted fields, all marked
        │                          `provenance: quarantined`,
        │                          all `confirmed: false`
        │                                     │
        └──────────────┬──────────────────────┘
                       ▼
              Brand Brain proposes
                       │
                       ▼
         ┌─────────────────────────────┐
         │  DETERMINISTIC GATE (code)  │
         │  red lines · regime ·        │
         │  culture · entitlements     │
         └─────────────────────────────┘
                       │
                       ▼
              code executes: Zernio,
              ledger, storage, cron
```

**The rule in one line:** anything a customer supplied is data to be confirmed,
never an instruction to be followed.

### On MCP

MCP is fine as a transport and dangerous as a trust model. Tool *descriptions*
are model-visible and user-invisible, which makes tool poisoning real; servers
act with their own privileges, which makes confused-deputy real; and definitions
can change after approval. If MCP is used, treat every server as untrusted, pin
tool definitions, and never grant an MCP-invoked tool ambient credentials.

**None of the four code-owned actions above should ever be reachable via MCP.**

---

## 3. The schema

### What exists today

Six sections resolved in one shot. Two structural problems:

- `customer_persona` is a **single object** with one one-liner, one pain, one
  fear.
- `hook.core_promise` is **singular**.

That holds for a café. It breaks for an incubator (founders and funders), a
school (parents and students), a marketplace (buyers and sellers), and any B2B
sale decided by a committee. Forcing them into one persona writes for an average
person who does not exist.

**Fix this before more brains are written.** Ten workspaces have a
`brand_memory` row today. That is the cheapest this migration will ever be.

### Four kinds of field

Every field carries a `kind`. It determines whether it can be asked, edited, or
deleted.

**MANDATED** — set by regime or locale, visible, **not editable by the owner**.
"This clinic may not promise a cure" is not a preference and the owner is not
the party entitled to waive it. Carries a `source` and a `ruleset_version`.

**ASKED** — only they know it. Never guessed.
`red_lines` (owner tier) · `banned_phrases` · `audiences[]` · what they sell ·
proof points · offers

**NEGOTIATED** — they have the instinct, we have the craft. Never asked as a
parameter, always shown as **two outputs** with "which sounds like you?"
`voice.tone` · `formality` · `signature_phrases` · `core_promise` per audience ·
palette

**DERIVED** — asking makes the data worse. Every owner thinks their shop is The
Rebel; every owner says their values are "quality, honesty, customer focus."
`archetype_hint` · `core_values` · `primary_fear` · `sample_hooks` ·
`signal_lock`

Derived fields are **never asked and never counted in the ring**. They appear in
the Brain with their evidence attached: *"Caregiver, because you said slow
reads, regulars, and no discount-shouting."* A diagnosis without its reasoning
is an assertion the owner cannot fairly argue with.

### The record

```jsonc
{
  "identity": {
    "legal_name": "...",
    "category": "CafeOrCoffeeShop",        // schema.org
    "regime": "consumer",                   // sets MANDATED red lines
    "model": "local_presence",              // sets questions + content forms
    "locale": "IN-OR"                       // sets calendar + cultural red lines
  },

  "audiences": [                            // ← the array. one primary.
    {
      "id": "regulars",
      "primary": true,
      "one_liner": "...",
      "pains": ["..."],
      "core_promise": "...",                // promise varies BY AUDIENCE
      "kind": "asked",
      "confirmed": true,
      "source": "owner"
    }
  ],

  "voice": {
    "tone": {                               // NN/g four dimensions
      "humor": 0,                           // funny ↔ serious
      "formality": -1,                      // formal ↔ casual
      "respect": 1,                          // respectful ↔ irreverent
      "enthusiasm": 1                        // enthusiastic ↔ matter-of-fact
    },
    "signature_phrases": ["..."],
    "kind": "negotiated",
    "confirmed": true
  },

  "red_lines": {
    "mandated": [                           // NOT editable
      { "rule": "no outcome guarantees",
        "source": "packs/regime/india-healthcare.md",
        "ruleset_version": "2026.08" }
    ],
    "owner": ["no discount-shouting"]       // editable, ASKED, never guessed
  },

  "visual": { /* W3C DTCG tokens */ },
  "proof": { "points": ["..."], "kind": "asked" },
  "derived": { "archetype_hint": "caregiver", "evidence_refs": ["..."] },
  "signal_lock": "moderate"
}
```

**Why NN/g's four tone dimensions rather than adjectives:** they are orthogonal,
small, output-testable, and backed by actual user studies showing tone shifts
perceived trustworthiness. "Warm, bold, authentic" is adjective soup that every
competitor could adopt unchanged.

**Why `archetype_hint` is optional and never load-bearing:** the twelve
archetypes are a 2001 marketing invention, not Jung. Useful as a generative
nudge. Never a compliance input, never a mandatory field.

**Confirmation state lives in a sibling map**, keyed by field path and versioned
alongside the brain. The payload contract is re-validated in SQL with exact
array lengths — leave it alone.

---

## 4. Packs

Knowledge as versioned markdown, not code. Because regime rules, cultural
calendars and question banks are written by humans, change constantly, and grow
forever. Adding Tamil Nadu should not require a deploy.

### Format

YAML frontmatter plus markdown body, following the structure Anthropic's Agent
Skills standardised — three-tier progressive loading solves the token budget by
design.

```yaml
---
id: culture-india-odisha
version: 2026.08
kind: culture              # regime | model | culture | questions
applies_to:
  locale: [IN-OR]
mandated: true             # red lines from this pack are NOT owner-editable
authored_by: "..."         # who vouched for this. required for culture packs.
reviewed: 2026-08-01
---

## Calendar

### Nuakhai — day after Ganesh Chaturthi
Harvest thanksgiving, strongest in western Odisha. Families travel home.
**Fit:** high. Family, prosperity, food framing.
**Register:** warm, celebratory.

### Rath Yatra — June or July
Jagannath pilgrimage. Religiously serious.
**Fit:** presence yes, promotion no. Service-led, not logo-led.
**Register:** reverence. A discount code attached to this is an incident.

## Red lines (locked)
- Deities, religious iconography and ritual objects are not decoration and not
  a sales frame.
- Sambalpuri ikat and Pattachitra are living crafts with communities behind
  them. Commission it, credit it, or do without it.
- Do not auto-translate into Odia. If the pack cannot vouch for the copy, write
  clean English.
```

### Directory

```
/packs
  /regime          india-healthcare.md · india-bfsi.md · india-food.md · _asci-core.md
  /model           local-presence.md · service.md · product.md · institution.md
                   considered-b2b.md · cause.md
  /culture         /india  odisha.md · tamil-nadu.md · _national.md
  /questions       one bank, rendered three ways
  /_schema         JSON Schema per kind, validated at load
```

### Loading rules

**Code selects packs, never the model.** Selection is a deterministic function
of `regime × model × locale`. If the model chose its own packs, a regulated
business could be talked out of its regulatory pack.

Three tiers: the index (id + description, always loaded) → the body (loaded when
selected) → referenced detail files (loaded on demand). Keep bodies under ~5,000
tokens.

**Every pack ships with a behaviour test.** A golden set of generation prompts
run with and without the pack, asserting the intended change. The healthcare
pack must make cure claims disappear. A pack that changes no output is not
knowledge, it is decoration.

### The honest constraint on culture packs

A general model is fluent and unreliable about hyperlocal culture — which is
precisely the failure mode this component exists to prevent. Ask a model which
week Nuakhai falls in this year and you get confidence, not accuracy.

**Culture packs must be authored by people who live there.** Two or three states
done properly, named in-product, everywhere else running the national default
and saying so. A pack you cannot vouch for should not exist.

---

## 5. Onboarding — the fewest questions possible

Every additional form field costs 3–5% completion. Six-plus fields averages 15%.
So: **ask four things, infer the rest, confirm through outputs.**

### The ask

**Screen 1 — three picks, one screen (pass 00)**
1. What kind of business is this? → regime
2. What does marketing mostly do for you? → model
3. Where do your customers actually live? → locale

Free text on any of the three gets classified and read back: *"Sounds like an
incubator in Bhubaneswar. Credibility first, two audiences, Odia calendar. That
right?"*

This is the cheapest safety mechanism in the product. It loads the locked red
lines, the autonomy ceiling and the content repertoire before a single word is
written.

**Screen 2 — the door**

Three doors, one question bank. The workspace decides which opens first: a solo
signup gets chat; an agency workspace gets URL and upload.

| Door | For | What it takes |
|---|---|---|
| **URL** | anyone with a website, a GBP listing, or an Instagram | one paste |
| **Upload** | brands with a brand book; agencies inheriting one | drag a PDF |
| **Chat** | the owner who is the answer | four questions |

### The URL door — where Firecrawl earns its place

This is the highest-leverage input in the product. One paste yields what
otherwise takes twelve questions:

- What they sell, and their actual words for it
- Who they serve, often both audiences
- Proof points, credentials, testimonials
- Contact details, hours, location
- **A real voice corpus** — their existing copy, not an adjective

Crawl several pages, not one. A single page yields the category's voice, not the
company's.

**Everything Firecrawl returns is quarantined.** It goes to the quarantined
model with no tool access, delimited and provenance-tagged, and comes back as
extracted fields marked `confirmed: false`. A website that says *"our voice is
bold and we make strong claims"* is a data point about their copy, not an
instruction to the system.

**Fail honestly.** A thin site, a JS-only site, a Facebook page with no text — say
so and fall back to asking. Never invent a brand voice and present it as
extracted. That is a fake success state on the first screen a customer sees, and
it violates house law 03.

### What can be inferred reliably, and what cannot

| Signal | Reliability |
|---|---|
| Colour from logo (k-means) | **High** — propose, then confirm. Tune for 4.5:1 contrast |
| Website text as voice corpus | **High** when the site has real copy |
| Facts from a menu or brochure PDF | **High** — good proof points |
| Category, hours, location from GBP | **High** |
| Existing social posts as voice | **High** — but untrusted, quarantine it |
| **Archetype or "personality" from a logo** | **Low. Confident nonsense.** Use vision for concrete extractables only |

### The reveal

The Compendium is right that this is the highest-leverage screen in the product.
Choreograph it: the brand resolves, then the app repaints in their colour.
Curtain going up, not a payload dumped.

---

## 6. The Signal Ring

### The trap it avoids

A successful resolve fills every field. So **a "fields filled" ring reads 100%
the moment onboarding ends** — claiming completeness over a brain the model
itself flagged as weak, with nothing left to capture.

### Measure confirmed, not filled

The ring counts what the owner **confirmed**, against what Sahoda inferred and is
still guessing at.

- **Layer 1 — payload: always 100%.** Nothing downstream ever copes with a
  half-built brain. Plans, captions, sites and replies keep working.
- **Layer 2 — confirmation: the only number shown.** Day one is ~24% and says
  so.

**Derived fields are outside the denominator.** There is nothing for the owner to
confirm, so including them makes the ring unreachable and turns it into a guilt
meter. That leaves eight or nine askable fields — finite, fair, and it can
actually finish.

### What counts as confirmation — three deliberate acts

**Chose it** (picked one of two outputs) · **Wrote it** (typed or edited it) ·
**Kept it** (shown the guess plainly and tapped "that's right")

**What must never count:** publishing a post that used a guessed field ·
scrolling past it · not complaining for a fortnight. **Silence is not consent.**
The moment inaction moves the number, the number stops being true, and being
true is the only reason to build it.

### The principle that makes a guess safe

**Confidence earns distinctiveness.** A resolver fill is deliberately
conservative — warm, plain, unmistakably fine. Not a bold personality invented
on the owner's behalf, because an invented personality is how a brand accident
goes out under someone else's name.

So the writing gets braver as the Brain gets surer. A low ring produces safe
copy; a high ring produces sharp copy that could only be theirs. **That motivates
an answer far better than a percentage does**, because the payoff arrives in the
next caption rather than on a dial.

### Weighting

The heaviest unconfirmed field is always the next question, so the weighting is
also the scheduler.

`red_lines` (one breach is a brand accident) → `voice.tone` (touches every
output) → `audiences.primary` → `core_promise` → `banned_phrases` →
`signature_phrases`

---

## 7. Progressive capture — the passes

**One rule:** ask a question at the moment its answer visibly improves what is on
screen, and never in front of the thing the owner came to do.

Nobody can name their brand archetype cold. Anybody can tell you which of two
captions sounds like their shop — especially while looking at a draft of their
own post.

| Pass | Fires when | Ring |
|---|---|---|
| **00 Regime** | first visit, before anything | — |
| **01 Spark** | immediately after 00 | 0 → 24% |
| **01b Sign-off** | regulated regimes, first publish attempt | gates publish |
| **02 Intent** | after the first week plan lands | 24 → 39% |
| **03 Register** | first draft opened | 39 → 57% |
| **04 Proof** | site generate, or first offer | 57 → 71% |
| **05 Reply voice** | first inbox reply | 71 → 80% |
| **06 Learned** | Monday report, when evidence crosses threshold | 80%+ |
| **07 Occasion** | a locale observance ~3 weeks out | — |

**Pass 03 is the highest value in the ladder.** One tap moves the ring 18 points
because voice touches every caption, reply and page. It renders inline on the
draft as a dashed *Proposed* chip reading "assumed: warm, no emoji" — it looks
like an edit control rather than a question, which is the entire trick.

**Pass 06 matters most long-term** because it is the only pass that costs the
owner nothing to produce. The evidence arrives whether or not they cooperate.
`memory_events` already carries `diff`, `source`, `status` and `evidence_refs`
with accept/reject server actions — **this is pass 06 waiting for a UI.**

### The governor

Seven passes with independent triggers will collide, and a product that asks
something every session gets muted within a fortnight.

**G1** One pass per session, maximum · **G2** Always after the task, never in
front of it (01b is the sole exception) · **G3** The ring picks which — heaviest
unconfirmed field wins · **G4** A day between passes · **G5** Three declines and
it goes quiet for 30 days except Learned · **G6** Stop at strong lock

Total spend on the owner: roughly twelve exchanges over six weeks.

---

## 8. The refusal gate

**The Refine screen already tells users "Red lines — the Loop will refuse
these." It doesn't.** That is a promise in the UI the code does not keep, and it
is the same class as the planner claiming auto-publish wasn't live while it was.

It gets worse the moment regimes ship: a clinic picks "Health & care", sees three
locked red lines in their Brain, and publishes anything they like. **Showing
constraints you don't enforce is worse than having none** — you have told a
regulated business they are protected.

**The gate ships with regimes, or regimes do not ship.**

### Four layers, defense in depth

1. **Resolve the rule set (code).** From regime + locale. Record the exact pack
   `version` used.
2. **Hard deterministic checks (code).** Required disclosures present; banned
   patterns absent. Brittle against paraphrase — necessary, not sufficient.
3. **Classifier pass (model, bounded).** Catches indirect phrasing, cultural
   risk, red-line breaches the regex misses. Adds recall. **Never has the final
   say alone.**
4. **Human review** on anything flagged, plus every irreversible first action.

### Seven rules

**Check before it can ship** — a condition of the publish path, not an optional
preflight · **Refuse with a reason and a way forward** — name the line, say
whether it's inherited or theirs, offer a compliant rewrite in the same breath ·
**Ambiguity is not permission** — stop and ask; a borderline post held an hour
costs nothing · **The regime caps autonomy** — a café can reach "do it for me", a
clinic should not by default · **Check culture, not only compliance** — sacred
symbols beside a price, a cheerful greeting on a solemn day, a protected craft as
free texture · **Keep the record** — what was checked, what it said, who
approved, when, which Brain version and which pack version were in force ·
**Escalate to a named human** — not whoever happens to be logged in

### Audit trail

For every publish: artifact and hash · `brand_memory` version · pack versions in
force · which checks ran and their results · model and prompt version · who
approved · timestamp · channel.

The property that matters: you can later prove **what rule set was in force and
who approved against it.** `brand_memory` is already append-only and versioned,
so half of this is solved.

### On the Twin

Reframe `twin_preflight` from a predicted like-count to a **risk check**. A
predicted engagement number is exactly the invented figure the product refuses
everywhere else. Does this trip a red line, make a claim we can't back, borrow
something that isn't ours, read badly to a segment we never meant to address —
a hospital marketing head would pay for that. Nobody pays for a predicted
like-count.

---

## 9. Brand Brain needs a home

**Today it has none.** No nav entry, no route, nothing in the app displays it.
Returning to `/onboarding` starts blank and never loads the saved brain, so
editing one banned phrase costs 50 credits again. The only reader of
`brand_memory` in the entire codebase is `packages/mesh/src/brand-context.ts`,
server-side.

You cannot make something the core of the product when the user can never see
it.

**`/brain` ships in phase one.** It shows every field with its kind, its source,
its confirmation state, and — for derived fields — its evidence. Confirmed
renders solid, guessed renders dashed. The Certainty System already gives the
vocabulary; this needs no new visual grammar.

The ring lives in the topbar beside the credit chip — same rail as the money,
since it is the other thing that compounds. Click to open the Brain. Hover gives
one line: the most valuable unanswered question and what answering it improves.
**A door, not a dashboard.**

---

## 10. Model routing

| Task | Model | Why |
|---|---|---|
| Brand resolution from sparse text | strong reasoning + structured output | schema adherence matters most |
| Vision — logo, brochure PDF | vision-capable with JSON mode | pair with a deterministic k-means for exact hex |
| High-volume captions | small/fast tier | cost. Cache the Brain + Packs prefix |
| Compliance classifier | purpose-built guardrail | multilingual, incl. Hindi |

**The mesh routes text only.** Vision needs its own route, the way `IMAGE_ROUTES`
was added — new route, new ledger metering, same pattern.

**Cache the prefix.** The Brain plus selected Packs is a large, stable prefix in
front of every generation. Prompt caching cuts that dramatically. Keep the
regulatory pack in the cached prefix so it is always present and always cheap.

**Validate every structured output with Zod and retry on failure**, whichever
provider serves it.

---

## 11. Credit economics — fix this before shipping

A resolve costs 50. The grant is 100. A week plan is 20. **A new owner spends 70%
of everything they have before publishing a single post.**

**Every pass after 01 is free, and the first resolve is granted outright.**
Charge for output, never for the product learning who you are. Metering a
learning loop is the surest way to stop it working.

This also fixes finding #6: today Regenerate spends the second 50, and a user
who presses it once hits a wall at their first post.

---

## 12. Build order

**Phase 0 — Verify (half a day).** The Compendium is four days old and this
codebase moves fast. Confirm by file:line what `resolve_brand_memory`,
`memory_events`, `brand_memory` versioning and `signal_lock` actually do. Say
plainly what does not exist.

**Phase 1 — Schema (2 days).** `audiences[]` with one primary, promise per
audience, NN/g tone, four-kind field tags, the sibling confirmation map. Migrate
the ten existing brains. Cheapest it will ever be.

**Phase 2 — Brand Brain gets a home (2 days).** `/brain`. Confirmed solid,
guessed dashed, derived with evidence. Ring in the topbar.

**Phase 3 — Packs (3 days).** Format, JSON Schema validation, code-side
selection, behaviour tests. Author `_asci-core`, one regime, one model, and the
Odisha culture pack. **Add the six missing Noto script families in parallel** —
without them the first Odia caption renders as boxes.

**Phase 4 — The gate (3 days).** Deterministic pre-publish check, versioned rule
sets, audit trail. **Before regimes are exposed in the UI.**

**Phase 5 — Doors (3 days).** Question bank as data, then URL (Firecrawl,
quarantined) and chat. Upload last — extraction quality varies wildly by
document and it is the easiest to add later.

**Phase 6 — Passes (3 days).** 00, 01, 03, 06 first. 06 is nearly free because
the writeback queue exists. Then the governor.

---

## 13. Open decisions

| # | Decision | Why it matters now |
|---|---|---|
| 1 | **Chai shop or hospital chain?** | Changes which half of Brand Brain gets the hours. Culture-first or refusal-first. Doesn't need a full answer — needs enough to sequence |
| 2 | **Who authors the culture packs?** | The moat and the least automatable part. A wrong pack is worse than no pack |
| 3 | **Where do regime rule sets come from, and who keeps them current?** | Being confidently wrong about a clinical advertising rule is worse than having no rule |
| 4 | **How many models at launch?** | Six models × four regimes is 24 question sets. Author the models properly, let regime only edit constraints — six sets plus an overlay |
| 5 | **Does a confirmed answer go stale?** | Shops pivot. Re-ask the heaviest fields once a quarter as one "still true?" check. Never decay silently |
| 6 | **Firecrawl budget** | Priced per call. A multi-page crawl per signup is a real cost line at volume |

---

## 14. What could go wrong

**Prompt injection lands.** The defense is architectural, not perfect. Mitigation:
the four code-owned actions are unreachable from model output. Red-team the
quarantine path before the URL door opens to strangers.

**A culture pack is wrong.** Confident local nonsense is the exact failure this
component exists to prevent. Mitigation: authored, reviewed, named in-product,
and the owner is the local expert — a wrong date takes one tap to correct.

**The ring becomes a guilt meter.** Mitigation: derived fields out of the
denominator, no red states, no badge counts, no "complete your profile"
language, and a real resting point where it says "sharp enough."

**The Brain reads generic.** Apply the swap test: if a competitor could adopt
this brand guide unchanged, it contains no information. A generic brain is a
signal the inference is weak, and the ring should say so rather than hide it.

**Firecrawl returns nothing useful.** Thin sites, JS-only sites, Facebook-only
businesses. Mitigation: fail honestly and fall back to asking. Never invent.

---

## 15. The rules this inherits

Unchanged, and they govern here too:

- **No fake success states.** A field is confirmed or it is a guess, and it looks
  like what it is.
- **Assert on content, never status codes.** Sixth instance this month.
- **A guard that lives only in the application layer disappears.** Red lines go
  in the gate, not in a prompt.
- **"Does anything actually call this?"** — the tenant guard had no caller, the
  schedule RPCs had no caller. Brand Brain has no home. Same question.
- **Staging for migrations. Never production ref `rloztdhzfliyvpvxsgjl`.**
