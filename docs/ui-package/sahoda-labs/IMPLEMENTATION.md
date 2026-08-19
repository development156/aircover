# Porting this UI into the working dashboard

This package is a **reference implementation**, not a drop-in library. It is
vanilla HTML/CSS/JS with mock data so every screen and state could be designed,
argued about and seen before any of it touches production.

This document is how you get it into the real dashboard without losing the
things that make it feel finished.

> **If you only want the look**, stop here and read
> [`theme/RETHEME.md`](theme/RETHEME.md) instead. That kit is drop-in CSS that
> rethemes an existing dashboard without touching a single function, route or
> handler — about 20 minutes if you are on shadcn/ui. Come back to this
> document when you want the *behaviours* too.

---

## 1. What is actually portable

| Layer | Portable? | Notes |
|---|---|---|
| `css/tokens.css` | **Yes, verbatim** | Pure custom properties. Works in any stack. |
| `css/components.css` | **Yes** | Plain classes, no framework assumptions. |
| `css/layout.css` | **Mostly** | Shell + page frames. Class names may collide — see §3. |
| `css/motion.css` | **Yes** | The whole interaction feel lives here. Port it early. |
| `css/chat.css` | Yes | Self-contained. |
| `js/icons.js` | **Yes** | Convert to components/SVG sprites; the paths are the value. |
| `js/ui.js` helpers | Rewrite | Overlay/toast/popover become your framework's primitives. |
| `js/interactions.js` | Partly | `runAction`, `Keys`, `createAutosave` translate almost 1:1. |
| `js/ai.js` | Partly | `AITask`, `stream`, `aiResult` are patterns worth keeping. |
| `js/pages/*.js` | **No** | Treat as **specifications**, not code. Read them, rebuild them. |
| `js/data.js` | **No** | This is fake. It exists to define the *shape* — see §6. |

The single most valuable thing here is not the code. It is the set of decisions
recorded in `README.md` and in the comments — the four-rung status ladder, the
"logos are objects not icons" rule, the motion table, the rapid-review queue.
Those survive any rewrite. The JavaScript does not need to.

---

## 2. Pick a strategy before you write anything

**Option A — Tokens + CSS first, keep your components.** Port `tokens.css` and
`motion.css`, then remap your existing components onto the new variables. Fastest
path to "it looks like the new design", lowest risk, and you can ship it in
pieces. Recommended unless your current UI is unsalvageable.

**Option B — Rebuild the shell, migrate pages one at a time.** Build the new
sidebar/header/router, then move pages across behind a feature flag. Slower, but
you end up with the real thing. Recommended if the current IA differs from §4 of
the README.

**Option C — Full rewrite.** Only if the existing dashboard is a prototype you
were going to replace anyway. It is the most expensive option and the one most
likely to lose behaviours quietly.

> If the existing dashboard is Next.js + Tailwind + shadcn/ui (the common shape
> for a Claude-built dashboard), **Option A is strongly preferred**. Map the
> tokens into your Tailwind theme and your existing components inherit the
> design system for free. Details in §3.

---

## 3. Phase 0 — tokens (do this first, it is 80% of the look)

Copy `css/tokens.css` in unchanged and import it before everything else. Nothing
else in this package works without it.

### If you use Tailwind

Point the theme at the CSS variables rather than duplicating hex values, so
there is exactly one source of truth:

```js
// tailwind.config.js
theme: {
  extend: {
    colors: {
      brand:   'var(--orange)',
      ink:     'var(--black)',
      muted:   'var(--grey)',
      line:    'var(--gainsboro)',
      surface: 'var(--surface)',
      'surface-2': 'var(--surface-2)',
      'text-2': 'var(--text-2)',
      'text-3': 'var(--text-3)',
    },
    borderRadius: { DEFAULT: 'var(--r)', lg: 'var(--r-lg)', sm: 'var(--r-sm)' },
    spacing: { 1:'var(--s1)', 2:'var(--s2)', 3:'var(--s3)', 4:'var(--s4)', 5:'var(--s5)', 6:'var(--s6)' },
  }
}
```

### Dark mode

`tokens.css` switches on `[data-theme="dark"]` on `<html>`, **not** on Tailwind's
`.dark` class. Either change the selector in `tokens.css` to `.dark`, or set both
attributes when toggling. Do not run two theming systems side by side — that is
the fastest way to get a component that is light in a dark panel.

### Class-name collisions

The utility names here are short (`.row`, `.card`, `.btn`, `.grow`, `.g2`). In a
Tailwind or Bootstrap codebase some of these **will** collide. Before importing
`components.css`, either:

- prefix everything (`.sh-row`, `.sh-card`, …) with a find-and-replace, or
- scope the whole sheet under a wrapper: `.sahoda { … }` and put that class on
  your app root.

Pick one and do it in the first commit. Retrofitting a prefix later is painful.

---

## 4. Phase 1 — the shell

Build these in order. Each is independently shippable.

1. **Layout frame** — sidebar (232px) + header (56px) + scrollable content.
   Grid, not float. See `.app` in `layout.css`.
2. **Navigation** — with `aria-current="page"` and the live badge counts.
3. **Theme toggle** — persisted to storage, sets `data-theme` on `<html>`.
4. **Page transition** — the `page-in` class on content only. The shell must not
   move. This one 280ms animation does more for perceived quality than anything
   else on the list.
5. **Command palette** — `⌘K`. Ship it with Recent + Suggested from day one; an
   empty palette teaches users it is not worth opening.
6. **Toasts** — port `notify.*` as-is conceptually. Four kinds, max three on
   screen, error toasts carry an action.

---

## 5. Phase 2 — pages, in this order

Ordered by value-per-effort, not by navigation order:

1. **Approvals** — the highest-frequency screen and the one with the most
   behaviour (§7). Get this right and the product feels fast.
2. **Home** — mostly composition of components you now have.
3. **Connections** — small, and the guided connect flow is a good template for
   every other multi-step flow.
4. **Planner** — calendar grid + drag/drop. Budget real time for conflict
   handling.
5. **Analytics** — charts are the only place you may want a library (§9).
6. **Campaigns → Builder → Detail**
7. **Brand Brain**, **Conversations**, **Assets**, **Settings**

---

## 6. The data contract

`js/data.js` is fake, but its **shape** is the specification. Your API needs to
supply at least this per screen. Fields marked ⚠ are ones the UI genuinely
cannot fake.

### Approvals
```ts
{
  id: string
  platform: 'instagram'|'linkedin'|'whatsapp'|'tiktok'|'googleads'|…
  kind: 'Post'|'Story'|'Campaign'|'Broadcast'|'Ad'
  title: string
  desc: string
  priority: 'High'|'Medium'|'Low'      // ⚠ drives the status ladder
  due: string                          // human text, e.g. "Due in 3h"
  dueSort: number                      // ⚠ hours until due — the queue sorts on this
  status: 'pending'|'approved'|'rejected'
  ai: string                           // ⚠ the reasoning shown inline. Not optional.
  caption, audience, schedule: string
  predict: { reach, engage, conv: string }
}
```

### Connections
```ts
{
  k: string                            // platform key — must match the icon map
  group: 'Social'|'Advertising'|'Commerce'|'Messaging'|'Analytics'
  status: 'connected'|'disconnected'|'error'   // ⚠ three states, not a boolean
  sync: string                         // "2 min ago"
  account: string
}
```

`error` vs `disconnected` is a real distinction the whole page depends on:
*error* means it used to work and now doesn't (publishing is paused, show it
loudly); *disconnected* means it was never set up (calm, just an invitation).
If your backend returns a boolean, this page loses most of its usefulness.

### Everywhere
- **Counts must be live.** The sidebar badge, the Home count and the approvals
  header all read the same source. If they can disagree, they will.
- **The AI assistant reads the same store as the pages.** In this build
  `workspaceMood()` derives the mascot's face from approvals + connections. That
  is why it can never contradict the UI. Keep that property.

---

## 7. Behaviours that are easy to lose

These are the difference between "looks like the design" and "feels like the
design". Each is cheap on its own and invisible when missing — until you compare
side by side.

- **Optimistic mutations.** Approve → the row animates out, counts tick, activity
  gains a line, sidebar badge updates. No refetch, no spinner over the page.
  Offer **Undo** in the toast rather than a confirm dialog.
- **Button lifecycle.** default → busy (spinner, *width pinned*) → `✓ done` →
  back. Pinning the width is what stops the layout jumping.
- **Rapid review.** `A` approve, `R` reject, `E` edit, `J`/`K` move, `?` for help.
  Shortcuts must stand down while typing **and** while a dialog is open.
- **Detail in a drawer, never a page navigation.** The queue behind it is the
  context; navigating away destroys it.
- **AI reports work, never spins.** One live step, completed ones ticked, then a
  clear completion. `AITask` is the reusable piece.
- **Streamed generation.** Text arriving progressively reads as *being written*.
  Pasting a finished block reads as a page load.
- **Errors carry a recovery path.** What happened, what is unchanged, and the
  button that fixes it. See the Search Console failure in `connections.js` — it
  fails deliberately on first attempt so the recovery path had to be designed.
- **`prefers-reduced-motion`** removes decoration but keeps state transitions.

---

## 8. Assets

```
icons/    10 platform logos (PNG). Used via BRAND_PNG in js/icons.js.
mascot/   4 expression faces (11–14) + 5 renders. See README §The mascot.
logo/     dark logo.png (light theme) · white logo.png (dark)
          favicondark.png / favicon white.png (mark only, for the tab)
          banner.png (greeting artwork)
```

Rules that are not obvious:

- **Platform logos get no container.** `.tile--brand` removes the background and
  border and lets the mark fill its slot. A logo inside a grey bordered box is a
  box inside a box.
- **The lockup crops, it does not shrink.** When the sidebar collapses, the
  container narrows to ~34px to reveal just the mark. Scaling the whole lockup
  down makes "Labs." illegible.
- **The mascot's four faces map to four AI states** and are picked by one
  function. Do not let them become decorative.
- **The favicon follows `prefers-color-scheme`, not the app's theme toggle.**
  The tab strip is browser chrome and tracks the OS, so a user on a dark OS with
  the app in light mode still needs the white mark. Declare the `media` variant
  first and the plain one last as the Safari fallback.

### ⚠ A gotcha that cost real time

A `url()` inside a **CSS custom property** resolves relative to *the stylesheet
that consumes it*, not the document. Setting `--greet-art: url("logo/banner.png")`
from JS and consuming it in `css/layout.css` resolves to `css/logo/banner.png`
and silently 404s — no console error, just no image.

Set `element.style.backgroundImage` directly instead; inline styles resolve
against the document. In a bundler this bites differently again — prefer
`import bannerUrl from './banner.png'` and pass the resolved URL.

---

## 9. Things to decide, not copy

- **Charts.** These are hand-rolled SVG — fine for line/sparkline/ring/bar, and
  they gave exact control over the draw-in animation and hit targets. If you need
  zoom, brushing or real tooltips, take a library (Recharts, visx) and keep the
  *interaction rules*: draw once on entry, hover shows value + delta, click drills
  through to the campaigns behind that point.
- **Drag and drop** is pointer-only here. Production needs touch and keyboard
  reordering — use `dnd-kit` rather than porting these handlers.
- **The 3D mascot** (`mascot/Agent.spline`) is wired but off. It needs a
  `.splinecode` export from Spline, ~1MB of runtime and a GPU. Ship without it;
  turn it on later if it earns its place.
- **Virtualisation.** No list here is long enough to need it. Real inboxes and
  asset libraries are — plan for it in Conversations and Assets.

---

## 10. Do not port

- `js/data.js` — replace with your API layer.
- The fake latency (`setTimeout` in AI flows) — replace with real request state.
  Keep the *staged step display*, drive it from real progress.
- `Connections.failOnce` — a deliberate demo failure. Delete it; keep the
  failure **UI**.
- `sessionStorage` peek suppression — replace with a real per-user preference.

---

## 11. Definition of done

Port is complete when all of these are true:

- [ ] One theming system. No component is light inside a dark panel.
- [ ] Sidebar badge, Home count and Approvals header can never disagree.
- [ ] Approve from Home and from Approvals both update optimistically, with Undo.
- [ ] `⌘K`, `A`, `R`, `J`, `K`, `?` work and do nothing while typing.
- [ ] Every error state names a cause and offers an action.
- [ ] Every empty state says what the area does and what to do next.
- [ ] `prefers-reduced-motion` is honoured.
- [ ] Mobile is recomposed, not shrunk — touch targets ≥44px, drawers become
      sheets, tables become cards.
- [ ] Keyboard focus is visible everywhere and trapped inside dialogs.
- [ ] The palette audit still returns only the five brand colours plus
      achromatic surface steps. (`grep -rhoiE '#[0-9a-f]{3,8}' css/ | sort -u`)
