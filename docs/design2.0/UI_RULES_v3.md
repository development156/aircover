# SAHODA LABS — UI Rules v3.0

Read before writing any UI in `apps/web`. **Supersedes UI_RULES_v2.md — delete that file.**
Where this and `packages/shared` (frozen zod contracts) disagree, `packages/shared` wins.

- Tokens: `packages/shared/tokens.css` (v3.0)
- Visual reference: `docs/design2.0/sahoda_design_system_v3.html`
- Design System doc 08 remains canon for governance; its §2 token values are superseded.

## The thesis

**Structure carries meaning. Colour carries identity.**

The app wears each customer's brand — one workspace makes it green, another red. So nothing
may depend on colour to be understood. Every state must survive recolouring, greyscale, and
a colourblind shop owner on a cheap Android screen. If a chip only reads as "published"
because it is green, it is broken.

The metaphor is a **ledger**, not a dashboard. Dashboards perform; ledgers account. Precise,
tabular, every entry explained, monospace for anything countable.

## The Certainty System — non-negotiable

Four levels of how real a thing is. Classes are in the token file.

| Level | Class | Treatment | Means |
|---|---|---|---|
| Real | `.is-real` | Solid fill, no border | It happened |
| Committed | `.is-committed` | Hairline + tint | You approved it; it will happen |
| Proposed | `.is-proposed` | **Dashed border** | Sahoda suggests; provisional |
| Simulated | `.is-simulated` | **Diagonal hatch** + text label | Not real |

Rules:
- Any status-bearing element uses one of these — post chips, planner pills, publish logs,
  wallet entries. Do not invent a fifth treatment.
- `.is-simulated` **always** carries a visible text label. The hatch alone is not a claim.
- Approving a proposed item turns the dash solid. Approval is a visible event, not a
  silent database write.
- A post-level summary must never outrun the variant rows beneath it. If one channel
  published and another did not, the summary says so.
- `.blade` marks **agency** — Sahoda acted rather than the user. One meaning, nothing else.

## Product principles

1. **Publishing follows the Autonomy Dial (FSD 0.2).** L0–L2: nothing publishes or spends
   without an explicit user action. L3 Autopilot exists by design — do not "fix" it away.
   Any autonomous action shows what, when, where and the exact credit cost beforehand,
   and logs Sahoda-as-actor.
2. **Credits are always visible.** A spending button carries its cost in the label
   (`Rewrite · 1 credit`), never in a tooltip. Any response carrying `balance` updates the
   topbar pill immediately.
3. **No fake success states.** This is the product. A chip never says "Published" unless
   it published.

## Stack

- Next.js 15 App Router, React, TypeScript strict, **Tailwind v4** mapped to the token layer.
- Every colour, space, radius, type and motion value comes from `tokens.css`. A literal hex
  or px in `apps/web` is a bug (ESLint enforces; exceptions: `1px` borders and `0`).
- Icons: Lucide, 18px, stroke 1.75.
- Use the app's existing data-fetching patterns and the zod contracts. No new state
  libraries, component libraries, or CSS-in-JS. Ask before adding any dependency.

## Token discipline

- **L1 Brand Skin sources** (`--p --pfg --pstrong --acc --t50 --t100 --t300`): the theming
  engine overrides exactly these seven (TSD §17). Never rename, never hardcode their values,
  never override outside the theme engine. Breaking this chain breaks live logo re-theming.
- **L2 v3 names** (`--brand`, `--ink`, `--canvas`, `--space-4`): what new code uses.
- **L3 legacy names** (`--bg`, `--s1`, `--muted`): existing components only. When migrating a
  surface, move it to L2 and delete the alias at the end — never mid-migration.
- **Spacing is `--space-N`.** `--s1` and `--s2` are surface colours in the legacy layer.
  Redefining them as spacing blanks every card in the app.
- New colour pairs enter via the Readability Guard (≥4.5:1 body, ≥3:1 large/UI) or not at
  all. Attach Guard output to the PR (08 §9).
- `--ink-faint` is disabled/decorative only. Never content text.

## Components

- Function components, named exports, props interface directly above. Default exports for
  pages only.
- ~150 lines max; split before that.
- Presentational components take data as props and never fetch.
- Compose variants with `clsx`, not string concatenation.
- Every interactive element keyboard-operable. Icon-only buttons carry `aria-label`.

**Definition of done:** renders every state in its spec (default, hover, active, focus,
disabled, loading, error, empty), consumes only tokens, is keyboard-operable, has its
branching logic tested, holds at 1280 / 768 / 375 — **and still re-themes correctly under a
non-default Brand Skin.**

## Credits protocol

- Costs are server-owned. Fetch on boot, cache for the session, pass in as a `cost` prop.
  Never hardcode a cost.
- Every spend response carrying `balance` writes straight into the credits cache.
- Failure after reserve releases the HOLD server-side; the UI says so:
  `That didn't work — your N credits were returned.`
- Insufficient balance disables the button with the shortfall named. A `CREDIT_INSUFFICIENT`
  error at click time means the cache went stale — refetch, never show a raw error.
- Credit and money numbers use `.num` (mono + tabular).

## Copy

- Sentence case except eyebrow labels (uppercase, mono).
- Buttons name the action: `Schedule`, `Approve week`, `Draft reply`. Never `Submit`, `OK`,
  `Confirm`. The verb keeps its name through the flow: `Publish` → `Published.`
- Errors say what happened and what to do. No apologies, no "Oops."
- Empty states invite an action, never describe a void.
- Costs read `· N credits`, singular `· 1 credit`.
- Predictions say "predicted". Sahoda speaks first person, ≤2 sentences per bubble.
- EN + HI ship together for any new user-facing string.

## Accessibility floor

- Global focus ring from tokens — no per-component overrides.
- Text ≥4.5:1, UI/large ≥3:1, only verified pairs.
- `prefers-reduced-motion` respected by every animation including blade-sweep and confetti.
- Touch targets ≥44px on phone.
- `aria-live` on the assistant toast, generation progress, and balance changes.
- **The greyscale test:** if a state is indistinguishable with colour removed, it fails.

## Stop and ask

- A design state not covered by the specs.
- A field missing from `packages/shared` — file a cross-lane request; never edit shared
  or applied migrations.
- Anything touching approval, autonomy, publishing, or credit-spend paths.
- Any new dependency.
- Anything that would make a simulated path look real.
