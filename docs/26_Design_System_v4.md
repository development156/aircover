# 26 · Design System v4

**Status:** canon. Supersedes `docs/08_Design_System_SAHODA_LABS.md` **and**
`docs/ui-package/sahoda-labs/` (the ported kit and its `RETHEME.md`). Where any of those
disagree with this file, this file wins.

**Source of truth for values:** `packages/shared/tokens.css`. This document explains the
values; it never restates one that could drift. **Living reference:** `/design-system` —
a real route rendering the real primitives, with a greyscale toggle.

**Read this before building a screen.** If it does not answer your question, that is a bug
in this document — say so rather than inventing an answer, because five sessions inventing
five answers is exactly how the product got the way `docs/27_Design_Audit.md` describes.

---

## 0. The one idea

Sahoda's users run small businesses. They check this app between customers, on a phone, and
they need to know one thing fast: **what is real, what is promised, and what needs me.**

So the system's organising principle is not a colour or a shape. It is **certainty made
visible** — every element says how real it is, structurally, before you read a word of it.
That is the signature. Spend your design attention there and keep everything around it
quiet.

Two consequences that run through everything below:

1. **Hue is never load-bearing.** The palette is one orange, black, white and greys. There
   is no red and no green. Meaning is carried by fill weight, edge, texture, glyph and
   word — any one of which survives greyscale, a colour-blind reader and a photocopy.
2. **Honesty outranks polish.** Where the app cannot know something, it says so. The job of
   the system is to give that a *vocabulary*, never to hide it behind a prettier lie.

---

## 1. Colour

### 1.1 The ration

`#FF6600` is the brand and it never changes. It is also, measured, **2.94:1 on white** —
which fails AA body text (4.5:1), fails AA large text (3:1), and fails the WCAG 1.4.11 floor
for UI component boundaries and focus indicators (3:1). It misses every threshold there is.

The answer is not to remove it. It is to **ration** it:

| Use | Allowed? | Why |
|---|---|---|
| A filled surface — button, chip, badge, active nav wash | **yes** | It is a fill, not text. Put ink on it (§1.2). |
| A focus halo | **yes**, as the outer ring only | The ink core carries the contrast (§1.4). |
| A 2px active-state rail, a 1px edge | **yes** | Decorative reinforcement of a state that is already legible without it. |
| **Text on a light surface** | **NO** | 2.94:1. Use `--acc` (§1.3). |
| Two primary actions in one view | **NO** | See §1.5. |

### 1.2 Ink on orange, not white on orange

`--pfg` is `#000000`. **Measured 7.15:1**, verified on rendered pixels by
`e2e/design-system.spec.ts` ("text on a brand fill is ink").

This was not a taste call. `brandSkinVars()` — the Readability Guard that every **customer**
workspace theme already passes through — returns `var(--ink)` when handed Sahoda's own
orange. The app was holding a tenant's brand to a standard it did not apply to its own, and
the token file annotated the pair as `3.13:1`, a figure nothing produces.
`src/lib/design/own-medicine.test.ts` now grades `tokens.css` against that same guard.

On hover a brand fill goes to `--pstrong` (`#000000`) with white text. Keep that pairing;
black-on-black is the obvious way to get this wrong.

### 1.3 Accent text has its own value

| token | light | dark | measured |
|---|---|---|---|
| `--acc` (accent **text**) | `#c95100` | `#ff6600` | **4.51:1** light · **6.32:1** dark |

One token, two values, because the constraint only ever existed on light: `#ff6600` on
`#131315` already measures 6.32:1. `#c95100` is the *darkest* step along the same hue that
clears AA — solved by `scripts/design/contrast.mjs`, not chosen by eye. It reads as the
brand orange, deepened, rather than as a different colour.

### 1.4 Focus is two-tone, and that is a requirement

```css
:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--brand-lift);
}
```

An orange ring alone is 2.94:1 against white — it misses the 3:1 rule by 0.06. A
near-identical darker orange (`#fb6500`, 3.02:1) would pass the letter of the check while
being invisibly different, which is gaming it. The ink core carries the contrast; the orange
halo carries the brand. It also survives **on top of an orange fill**, which no single-colour
ring can.

Never override focus per component. There is one treatment.

### 1.5 One primary action per view

If two things look equally like the main action, neither is. Everything else is `secondary`
(hairline) or `ghost`. A destructive action is never the primary and never gets standing
real estate in a list row — `/posts` gave every card a permanent `Delete` and nothing else.

### 1.6 There is no red

`--danger` and `--warn` are both the brand orange, deliberately. Severity is carried by
**fill weight + glyph + label** (§3). Do not add a red. If a state needs to shout, it moves
up the fill ladder and takes a louder glyph — it does not change hue.

Platform marks (Instagram, LinkedIn, …) keep their own brand colours. That is identity, not
UI chrome, and it is the only exception. It never leaks into a button, a surface or body text.

---

## 2. Dark is a peer, not an inversion

Dark shipped as a straight flip and lost most of its hierarchy. Measured:

| theme | primary | secondary | separation |
|---|---|---|---|
| light on `#ffffff` | `#000000` 21.0:1 | `#575756` 7.23:1 | **2.90×** |
| dark, as shipped | `#ffffff` 18.56:1 | `#dcdcdc` 13.53:1 | 1.37× |
| **dark, now** | `#ffffff` 18.56:1 | **`#979797` 6.35:1** | **2.92×** |

`#979797` was solved by `scripts/design/dark-ladder.mjs` against the light theme's
*separation*, not picked. It still clears AA body text.

`--surface` also moved `#131315 → #17171a`: against the canvas that step was ΔL 3.2/1000 and
is now 5.3/1000 — 66% more separation. **Dark surfaces cannot separate by fill alone** (sRGB
is compressed near black; even the new pair is 1.10:1), so in dark, fill and hairline work
together in a way they do not have to on light. Never remove a card's hairline "because the
fill already separates it" — in dark, it does not.

---

## 3. The Certainty System

Four rungs. How **real** a thing is.

| rung | means | signature |
|---|---|---|
| `.is-real` | It happened. A platform has it. | solid fill, no edge |
| `.is-committed` | It will happen. Someone decided. | tint + hairline edge |
| `.is-proposed` | Sahoda suggests it. Nobody agreed. | dashed edge |
| `.is-simulated` | Not real. A fixture. | diagonal hatch **+ a visible word** |

### 3.1 Greyscale proof

Measured by `e2e/design-system.spec.ts`, as composited greyscale luminance (/1000):

| rung | light fill | dark fill | edge | texture |
|---|---|---|---|---|
| `.is-real` | 308 | 308 | solid | — |
| `.is-committed` | 933 | **6** | solid | — |
| `.is-proposed` | 1000 | **3** | dashed | — |
| `.is-simulated` | 1000 | 3 | solid | hatch |

Read that table honestly, because it contains a trap:

- `.is-real` vs `.is-committed` are separated **by fill weight only** — same edge, no
  texture. The gap is large (625 in light, 302 in dark), so this holds.
- `.is-committed` vs `.is-proposed` in **dark** differ by **3/1000 of luminance**. The tint
  is invisible. **The hairline is doing 100% of the work.** A tint is near-the-surface by
  definition, so it can never be a signature on its own — if you remove the ring from
  `.is-committed` to "clean it up", the rung stops existing.
- `.is-proposed` vs `.is-simulated` have identical fills and are separated purely by
  dashed-edge vs hatch.

The test asserts all four remain perceptually unique and that the two relying on fill alone
stay >100/1000 apart. If you change a rung, that test tells you whether you broke it.

### 3.2 Certainty is not urgency, and not status

Three different axes. Do not collapse them.

- **Certainty** (`tokens.css`) — how real. A published post is maximally real.
- **Urgency** (`components/ui/badge.tsx`, four rungs) — how much it needs you. A published
  post is minimally urgent. Mapping `.is-real` onto rung 1 would stamp a `!` on every
  successful publish.
- **Status** (`lib/posts/status-mark.ts`) — what happens next.

### 3.3 RULING: three statuses share one rung, and that is correct

`certaintyFor` returns `committed` for **`approved`, `scheduled` and `published`** when no
variant row proves a publish. That is right and it must not be loosened: intent can never
reach `.is-real`, because approving a post is not publishing it.

But it meant three statuses rendered the identical chip and a list could not be scanned by
shape. The fix is a **second structural axis**, not a weaker rung:

```
certainty → how real is this   → fill + edge   (survives greyscale)
mark      → what happens next  → glyph         (survives greyscale)
```

`published` is a **double tick**. Sahoda's users live in WhatsApp; it is the most widely
understood "it left and it arrived" mark available, and `approved` is a **single tick** —
the same distinction WhatsApp itself draws, so the pair needs no legend.

`certainty-distinct.test.ts` asserts every status has a unique `(rung, glyph)` signature —
not just the pairs someone remembered to list — so a new `PostStatus` that duplicates an
existing look fails the gate rather than shipping.

---

## 4. The absence vocabulary

The most-rendered glyph in this product was an em dash meaning "nothing", doing three
different jobs. They are three different claims:

| state | treatment | example |
|---|---|---|
| **Not yet measured** — the slot is real, the reading has not arrived | `.is-unmeasured`, a solid 14×2 rule | Reach, before anything published |
| **Unreadable** — we asked and got nothing back | `.is-unreadable`, the same rule **broken** | a balance read that threw |
| **Does not exist** — there is no such quantity | **omit the slot entirely** | a monthly allowance, for a wallet that is a balance |

A solid rule reads as "not yet"; a broken rule reads as "the line to this number is cut".
The difference is structural, so it survives greyscale (proved alongside the rungs).

**Both marks require an accessible name.** A rule with no name is decoration a screen reader
skips, which makes the absence invisible rather than legible. Use the `Unmeasured` /
`Unreadable` components in `components/design-system/absence-row.tsx`, which carry it.

**There is deliberately no class for the third state.** `100 of —` rendered a numerator, the
word "of", and a dash — inventing a fraction with no denominator. If the quantity does not
exist, delete the slot.

---

## 5. Type

Base is **13px**, not 16. The density is most of the look.

| utility | weight · size/leading · tracking | when |
|---|---|---|
| `type-hero-num` | 650 · 44/44 · −0.03em | The **one** big number per view. Tabular. |
| `type-display` | 700 · 30/36 · −0.022em | Page hero. At most one, and never beside another hero. |
| `type-h1` | 600 · 24/30 · −0.022em | Page title. |
| `type-h2` | 600 · 20/26 · −0.011em | Section title inside a page. |
| `type-h3` | 650 · 15/20 · −0.011em | **Card and row title.** |
| `type-body` | 400 · 13/20 | Everything a person reads. |
| `type-sm` | 400 · 12/18 | Secondary. Never the only place a fact appears. |
| `type-eyebrow` | 600 · 11/14 · +0.06em, uppercase | Label above a group. Never a heading alone. |

`type-h3` is new and it is why headings drifted: between `h2` (20px) and body (13px) there
was a 7px cliff, so card titles were hand-written as `text-[15px] font-semibold` at each call
site and slowly diverged. **Never hand-write a font shorthand.** If no step fits, say so —
do not invent a size.

Tracking is optical: large type needs negative tracking to stop looking loose, 11px uppercase
needs positive tracking to stop looking cramped. One value per size band, never per component.

**Weights 550 and 650 are load-bearing.** Inter must load as a variable font or they round to
500/600 and the whole hierarchy flattens.

**Numbers**: anything countable a user is accountable for gets `.num` (tabular figures). A
balance whose digits shuffle as it changes reads as unstable.

---

## 6. Space

A 4pt scale. The step is chosen by **relationship**, not by eye.

| token | value | applies to |
|---|---|---|
| `--space-1` | 4px | a glyph and its label |
| `--space-2` | 8px | items in one row — chips, buttons in a group |
| `--space-3` | 12px | inside a compact control; a label and its field |
| `--space-4` | 16px | card padding; the gap between cards in a grid |
| `--space-5` | 20px | a section title and its content |
| `--space-6` | 24px | page gutter; between unrelated blocks |
| `--space-8` | 32px | between sections of one page |
| `--space-10` | 40px | above a page title |
| `--space-12` | 48px | between major regions — the largest step |

If you want more than 48px, you want a **divider**, not more space. Large empty gaps are why
`/create/post` and `/connections` read as unfinished: content stopped and the page did not.

**Spacing is `--space-N`.** Never `--s1`/`--s2` — those are *surface colours* here, and
redefining them turns `background: var(--s1)` into `background: 4px` and blanks every card.

---

## 7. Radius, borders, elevation — one story

**Hairline first.** A shadow means "this floats above the page", so only overlays get one.

| | value | when |
|---|---|---|
| `--r-sm` | 6px | buttons, inputs, badges, chips |
| `--r` | 8px | tiles, small surfaces |
| `--r-md` | 10px | segmented and larger controls |
| `--r-lg` | 12px | cards, nav items, wells — the default for a surface |
| `--r-full` | 999px | pills and avatars **only**, never a card |
| `surface-ring` | inset hairline | a resting card |
| `--sh-card` | 0 1px 2px / 4% | a card that must lift off a busy background |
| `--sh-pop` | 0 4px 16px / 8% | popovers, menus — floating and dismissable |
| `--sh-lg` | 0 16px 48px / 14% | modals and drawers; the only rung implying a scrim |

Use an **inset ring**, not a border, on surfaces: a border changes the box size, so a hover
that thickens the edge shifts the layout by a pixel. **Never use border and ring together** —
it is the single most common way this system goes wrong.

---

## 8. Motion

| token | value | for |
|---|---|---|
| `--dur-fast` | 140ms | colour, opacity, border — anything under the pointer |
| `--dur-base` | 180ms | panels, disclosure, tab changes |
| `--dur-slow` | 280ms | drawers and modals entering; nothing longer ships |
| `--ease` | `cubic-bezier(.2,0,.2,1)` | everything — one curve, so motion reads as one hand |

**What must never animate:**

- **A number changing.** A credit balance that counts up is a balance you cannot read.
- **Anything on the crash path.** An error must arrive, not ease in.
- **Layout on first paint.** The theme is set before paint for exactly this reason.
- **Anything at all** under `prefers-reduced-motion` — already enforced in `tokens.css`.

---

## 9. Controls, focus, touch

- `--control-h` **34px** (buttons, segmented controls), `--input-h` **38px** (inputs, selects).
  The density is deliberate.
- `--control-h-touch` **44px**. At narrow widths **every interactive control** grows to it:
  `max-narrow:min-h-[44px]`. Use the token, not a literal — scattering `44` by hand is how
  three of them end up at 40.
- **Focus**: one global treatment (§1.4). Never per-component.
- **Labels never collapse.** When the rail collapses to 64px the label goes `sr-only`, never
  `display:none` — `display:none` removes the node from the accessibility tree and takes the
  link's name with it. Nine unnamed links is what that bug looked like.

---

## 10. Primitives

Every one is on `/design-system` with every state it ships. **A primitive with no disabled
state on that page does not have one** — do not invent it at a call site.

`Button` · `Input` · `Textarea` · `Select` · `Tabs` · `DataTable` · `Card` · `Tile` · `Chip` ·
`Badge` · `StatusBadge` · `Modal` · `Drawer` · `SkeletonBar` · `EmptyState` · `ErrorFallback` ·
`ComingSoon` · `Progress` · `CostLabel` · toast (`sonner`, mounted in both layouts)

### 10.1 The pairs people confuse

| this | not this | because |
|---|---|---|
| **Tile** — a selectable option | Card | a card is a container and is not an answer to a question; a tile IS an option, so it must be a control, show selection, and be reachable by keyboard |
| **Chip** — data the *user* put there | Badge | a badge is a status the *system* computed and the user cannot remove; a chip is an input they chose and usually can |
| **Modal** — demands an answer | Drawer | a drawer is a side surface consulted while the page behind stays the subject; if the user must answer it, it is a modal |
| **DataTable** — values compared across records | a list of cards | see below |
| **Toast** — an outcome you can walk away from | Modal | a toast must never carry the only copy of something important, or the only way to undo it |

`Modal` and `Drawer` are both the native `<dialog>` — the focus trap, Escape, document
inertness and the top layer come from the browser rather than from us. Backdrop-click and
state sync are handled once, inside the primitives, so no call site reimplements them.

### 10.2 Three rules that are load-bearing:

**Coming-soon is a `<div>`/`<span>`, never `<button disabled>`.** A disabled button is still
announced as a button: a screen reader offers the action, the user takes it, nothing happens,
and the failure reads as "broken app" rather than "unbuilt feature". Guarded by
`e2e/design-system.spec.ts`.

**Tabs are links, not buttons.** Every tab here changes the URL. A link opens in a new tab on
cmd-click, appears in the page's link list, and survives a reload; `router.push` from a button
does none of that.

**A list of cards is not a table.** If the reader compares values *across* records, it is a
`DataTable`. If they read one record at a time, it is a list. `/posts` rendering eight records
as eight equal-weight cards, and `/home` and `/wallet` rendering the *same* dataset two
different ways, are the failures this rule exists to stop.

**`disabled` never means "coming soon".** A disabled `Tile` or `Button` means *this real
option is temporarily unavailable* — something the user could fix. An unbuilt feature is a
`<span>`. The gallery's own guard caught this exact mistake while this document was being
written: a disabled tile labelled "Coming soon" made `getByRole('button', {name: /coming
soon/i})` match, which is precisely the thing the rule forbids.

**An interactive primitive is a client component, and its handler must originate in one.**
A server component cannot hand a function to a client component. Passing `onRemove` to a
`Chip` from the server-rendered gallery returned a 500 — the same mistake any screen session
would make, so the working example lives in `overlay-demo.tsx` rather than being deleted.

---

## 10.3 The composer — the one screen that writes a post

Added by the composer session, because this document covered tokens, rungs, absence,
type and space and said nothing about a multi-pane writing surface. Five sessions
inventing five answers to the questions below is exactly what §0 exists to stop.

**One route.** `/posts/[id]`, where the id `new` means the row does not exist yet. There
is no separate "create" screen. Two routes is how this product came to have two editors —
a five-step wizard that could not generate variants, and a three-pane editor that could
not be reached without a row.

**The per-channel versions are the CENTRE, and they are a stack.** Not tabs, not a side
panel. One body per channel is the thing this product does that its competitors do not,
and a control showing one version at a time hides exactly that. The cost is page height
and it is paid deliberately: scrolling past four versions is the right amount of work for
reading four versions.

**The one primary action MOVES.** §1.5 allows one primary per view, and on a writing
screen the next thing to do genuinely changes:

| state | the primary |
|---|---|
| no channel picked | none — the channel row is the only thing to do |
| channels picked, no channel written | **Adapt for N channels · N credits** |
| every channel written | publishing, in the finish panel |

A per-channel repetition of ONE action — a `Publish to Instagram` beside a
`Publish to LinkedIn` — is **one** primary, not two. The split is the product.

**A sticky bar is `position: sticky`, never `fixed`.** Fixed chrome renders at its scroll
offset in a full-page screenshot (`docs/27` §0) and needs padding compensation on `<main>`
that every page then has to know about. Sticky participates in layout and photographs
where it sits. On a phone it stops `56px` short of the floor — the bottom navigation's
height — or the one control at the end of the page is the one control covered.

**A sticky bar does not carry an irreversible action.** Publishing is per channel and
needs its warnings, its per-channel status and its retry beside it. The bar links to that
panel with an anchor, because a link that scrolls is honest navigation and a button that
opens a sheet containing the real button is not.

**Two save states, never merged.** The post is one row and each version is its own. "All
changes saved" while three versions sit unwritten is the exact half-truth this product
refuses; the bar says both.

**A channel that has never been written FOLLOWS the post** — its body is mirrored into the
version's draft and marked unsaved, and the card says both things. It is real state, not a
display trick: `runPublishPost` sends `post_variants.body` and has no fallback to
`posts.body`, so showing the post's words in an empty channel box would describe a publish
that cannot happen.

**A precondition is not a dead end and not a coming-soon.** "Photos attach to a saved
post" is a sentence, not a disabled button. §10.2's rule is about unbuilt features;
something the app will do as soon as there is a row to do it to gets stated plainly.

### What this screen does NOT have, and why

There is no display-weight title field. §5 forbids hand-writing a font shorthand and §10
lists the primitives that exist; a document-title input is not one of them. It uses
`Input`. Adding one means adding it to §10 and to `/design-system` first.

There is no tone control and no expand. `CaptionRewriteInputSchema` in `@sahoda/shared` is
a frozen contract taking `rewrite | shorten | hookify`, and no mesh task writes a body from
a brief, so all three would be buttons that cannot work. They are named as absent in one
line of prose rather than rendered — a control the app cannot honour is worse than a
sentence saying so.

---

## 11. What NOT to do

- **Do not write a raw hex.** Anywhere. Tokens only.
- **Do not put orange text on a light surface.** Use `--acc`.
- **Do not use white on an orange fill.** 2.94:1. Ink.
- **Do not add a red, a green, or a fifth certainty rung.** If it does not fit, it belongs on
  an existing rung and the label does the work.
- **Do not hand-write a font shorthand or a pixel size.** Use the scale.
- **Do not render an em dash for a missing value.** Use §4 — and if the quantity does not
  exist, render nothing.
- **Do not remove a hairline because the fill separates it.** In dark it does not (§2).
- **Do not use border and ring together.**
- **Do not override `:focus-visible`.**
- **Do not give a destructive action standing space in a list row.**
- **Do not put two primary actions in one view.**
- **Do not rename or repurpose a token.** Names are load-bearing across 39 routes and five
  concurrent sessions. Add names; change values; never remove one.
- **Do not "fix" `certaintyFor` so the three statuses separate.** They share a rung on
  purpose (§3.3). The glyph is the separator.
- **Do not measure a responsive fix in the workspace-less state.** The credit pill and brain
  ring only render once a workspace exists, and a guard that skips the bootstrap measures a
  topbar three items short — which is how a 17px overflow at 390px stayed green
  (`docs/27_Design_Audit.md` §2.1).
- **Do not trust a full-page screenshot for fixed chrome.** `position: fixed` renders at its
  scroll offset, so the mobile bottom bar appears inlined halfway down the document. Use a
  viewport capture.
- **Do not report the black "N" in the corner of a dev screenshot.** It is
  `<nextjs-portal>`, Next's dev indicator, and it does not exist in production.

---

## 12. How to check your work

```bash
node scripts/design/contrast-report.mjs        # every colour ratio, incl. a pair shown FAILING
node scripts/design/dark-ladder.mjs            # the dark tonal ladder, solved
pnpm --filter @sahoda/web exec playwright test design-system   # greyscale + rendered contrast
pnpm --filter @sahoda/web exec playwright test shell-widths    # six widths, both themes, by TEXT
pnpm gate                                      # all five parts
```

`pnpm gate` is `turbo typecheck lint test` → `vitest run` → `turbo test:smoke` →
`prettier --check .` → **`turbo build`**. The build step is in the gate because a production
build error survived 27 runs that the previous four-part gate structurally could not reach.

**Read rendered text, not box sizes.** A regression pass that asserted widths, offsets and
overflow flags went green at every width and shipped a rail rendering the literal string
`"S Sah"`. Every number was right; the pixels were not.
