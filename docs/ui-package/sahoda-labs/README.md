# Sahoda Labs — AI Marketing Operating System

A complete, production-quality front-end for the Sahoda Labs product. One shell,
one design system, 17 routes. Open `index.html` — no build step, no dependencies.

---

## Documentation

| Doc | For |
|---|---|
| [`SPECIFICATION.md`](SPECIFICATION.md) | **Everything, in one document** — start here |
| [`theme/RETHEME.md`](theme/RETHEME.md) | **Keep your dashboard's functions, take this look** — drop-in CSS kit |
| [`IMPLEMENTATION.md`](IMPLEMENTATION.md) | Rebuilding this properly, screen by screen |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Module graph, boot, routing, render lifecycle |
| [`docs/API.md`](docs/API.md) | Every function signature with examples |
| [`docs/SCHEMA.md`](docs/SCHEMA.md) | The data contract your API must satisfy |
| [`docs/COMPONENTS.md`](docs/COMPONENTS.md) | Component markup reference |
| [`docs/FEATURES.md`](docs/FEATURES.md) | What exists and why it is built that way |

---

## Mental model

The whole interface is built to communicate one idea:

> **AI executes. You supervise. You approve what matters.**

Every page answers that in its own way — Home shows what AI did, Approvals is
where you accept or reject it, Brand Brain is what AI learned, Analytics is what
happened, and each AI recommendation ends in a button you can press.

---

## Information architecture

```
/home            What happened · what needs me · what next
/approvals       The supervision queue (list → detail drawer → decide)
/planner         Calendar + Board over the same scheduled work
/brand           Overview · Identity · Voice & Tone · Audience · Competitors · Knowledge
/analytics       KPIs · trend · channel table · AI insights
/campaigns       List
/campaigns/new   8-step builder with an AI health gate before launch
/campaigns/:id   Detail — metrics, channels, creative, insights
/conversations   Omnichannel inbox (list · thread · customer context)
/assets          Creative library, grid or list, AI actions per asset
/connections     Grouped by Social / Advertising / Commerce / Messaging / Analytics
/settings        Workspace · Profile · Team · Notifications · Integrations · Billing · Credits · Security
```

Creation is global, not a route: the `+` button and `⌘K` both open the Create
menu, which launches a flow in a modal so the page behind is never lost.

---

## Files

```
index.html
icons/                supplied platform logos (PNG) — the official marks
logo/                 lockup (light/dark), mark-only favicons, banner artwork
mascot/               the assistant character: 4 expression faces + 5 renders
css/tokens.css        palette, spacing, type, reset, dark theme
css/components.css    buttons, inputs, badges, tables, drawers, modals, skeletons, states
css/layout.css        shell, page frames, page-specific, responsive
css/motion.css        the whole interaction layer — transitions, states, reduced motion
js/icons.js           ~70 UI icons + 15 platform brand marks
js/data.js            all mock data — one source of truth
js/ui.js              overlays, toasts, popovers, charts, badges, states
js/interactions.js    button lifecycle, keyboard system, autosave, chart tooltips
js/ai.js              AITask, streaming, result bar, contextual AI
js/app.js             shell, router, command palette, notifications, theme
js/pages/*.js         one file per route, each registering into PAGES
```

Adding a route is one file: `PAGES.x = { skeleton(), render(params), mount(host, params) }`.

---

## Design system

**Palette — five colours.**

| Token | Value | Role |
|---|---|---|
| `--orange` | `#FF6600` | CTAs, active state, attention. Used sparingly. |
| `--black` | `#000000` | Primary text, headings, dark surfaces |
| `--grey` | `#575756` | Secondary text, muted elements |
| `--gainsboro` | `#DCDCDC` | Borders, dividers, disabled |
| `--white` | `#FFFFFF` | Background, high-contrast surfaces |

Everything else is one of those five at reduced alpha (`--orange-10`,
`--black-06`, `--white-16`, …). Two neutral surface steps (`#FAFAFA`, `#F4F4F4`)
and the dark theme's four near-black steps are achromatic lifts, not new hues.

**Status carries no hue.** It is carried by fill weight, a glyph and a label —
four rungs, loudest first:

| Rung | Looks like | Means |
|---|---|---|
| 1 | solid orange + `!` | Overdue, urgent, disconnected — the only thing that shouts |
| 2 | solid black | Active, current, selected |
| 3 | outlined orange + `!` | Pending, in review, needs a look |
| 4 | outlined grey + `✓` | Done, scheduled, informational |

The one exception to the palette is **platform marks** — Instagram, LinkedIn,
WhatsApp and the rest keep their own brand colours. A channel is identity, not
chrome, and a monochrome Instagram glyph costs recognition for no design gain.
Those colours never leak into buttons, text or surfaces.

Those marks come from `icons/` where a real logo file exists — Instagram,
Facebook, LinkedIn, TikTok, YouTube, X, WhatsApp, Telegram. Everything else
(Google Ads, Meta Ads, Shopify, Google Analytics, Search Console, Email) falls
back to a simplified inline SVG in `js/icons.js`. To swap a fallback for a real
logo, drop the file into `icons/` and add one line to `BRAND_PNG`:

```js
const BRAND_PNG = {
    …,
    shopify: 'my-shopify-logo.png',
};
```

Sizing is handled centrally — `.tile`, `.tile--sm`, `.tile--lg`, `.bic--sm`,
`.bic--md` and the calendar/week rules all cover both `<svg>` and `<img>`, so a
swapped file needs no CSS.

## The mascot

The robot is the assistant's face, and its four expressions map onto the four
AI states the product actually has — so the character carries information
rather than decorating a corner:

| Face | State | Where it appears |
|---|---|---|
| `13.png` blue, eyes down | **working** — AI is mid-task | AITask panels, Home while approvals are pending |
| `11.png` green, smiling | **all clear** — nothing pending | Approvals "all caught up", task completion |
| `12.png` amber | **needs your decision** — a high-priority approval waits | Home, Ask AI |
| `14.png` red | **something is broken** — a connection failed | Connection failure, Home |

### The chat

The mascot is also the launcher for the assistant, bottom-right. **It is the
only conversational AI surface** — the header sparkle, the per-page contextual
buttons, the command palette and Home's ask bar all open the same panel. Two
places to talk to one assistant would be exactly the duplication the rest of the
product avoids.

The launcher *is* the robot's head: a black screen with the current expression.
That means it reports the workspace before you open it — a red face in the corner
is a faster signal than a badge, and it can't lie, because it reads the same
`workspaceMood()` the pages do. It carries the pending count, and an orange ring
pulses only when something is genuinely broken.

Once per session, if something is actually waiting, it says so unprompted — a
dismissible bubble naming the real problem. Once, not twice; an assistant that
interrupts repeatedly is a nuisance.

Replies are **grounded in `DB`**, not canned: ask what to approve first and it
names the actual top item, its priority, its due time and its AI reasoning, then
points at the keyboard shortcut. It is a lookup with a voice, so it can never
contradict the page behind it.

Motion: the panel grows out of the launcher's corner (`transform-origin: 100%
100%`) so it reads as the same object opening; messages rise 8px as they land;
the face switches to *working* while thinking and the reply streams in.

`workspaceMood()` is the single rule that picks the face, so the mascot can
never contradict what the rest of the UI is saying. `setMascot(el, mood)` swaps
it in place — an `AITask` finishing changes the face from working to happy, and
that change *is* the completion signal.

**On colour.** The faces are green, amber, blue and red — outside the five-colour
system. They are contained inside a drawn black screen with a light bezel, the
same way the physical robot displays them, and they never leak into buttons,
text or surfaces. This is the same exception the platform logos get: a character
is identity, not chrome. If you'd rather the mascot were palette-only, the four
`MASCOT` entries in `js/ai.js` are the single place to change.

The five full-body renders (`0–4.png`) are 2048×983 presentation art with the
robot occupying roughly 15% of the frame. Only `0.png` is used, as a zoomed and
anchored hero strip in the Ask AI drawer (`.mascot-hero`). The rest are better
suited to marketing or a login screen than to product chrome — if you want one
inline somewhere, it needs cropping first.

### Live 3D mascot (Spline) — built, switched off

`mascot/Agent.spline` is the Spline **editor project** (MessagePack: scene graph,
physics, timeline animations). Browsers cannot load it — the web runtime needs a
`.splinecode`, which only Spline can generate.

**To switch it on:**

1. Open `Agent.spline` in Spline → **Export → Code** (Vanilla JS or Public URL).
2. Put the resulting `scene.splinecode` in `mascot/` — or copy the public URL.
3. Set one constant in `js/ai.js`:

```js
const MASCOT_3D = {
    scene: 'mascot/scene.splinecode',   // or 'https://prod.spline.design/…/scene.splinecode'
    …
};
```

That's the whole change. The scene then replaces the still hero in the Ask AI
drawer, loads lazily when the drawer opens, and is disposed when it closes so no
WebGL context is left running.

It stays **off by default on purpose.** The runtime is ~1MB from a CDN and needs
a network, WebGL and a live GPU — none of which the rest of this app assumes, and
it runs fine from `file://` today. Every failure path (offline, no WebGL, bad
path, reduced motion) falls back to the still mascot silently, so the drawer
never breaks.

**Metrics.** 8px spacing scale · page padding 24px · header 56px · sidebar 232px
· buttons 34px (28 small, 40 large) · inputs 38px · card radius 12px, control
radius 6–8px · base font 13px.

**Elevation** is hairline-first. Cards are separated by a 1px border, not a
shadow; shadows are reserved for things that genuinely float (drawers, modals,
popovers, toasts).

---

## Responsive

| Breakpoint | Behaviour |
|---|---|
| ≥1200px | Full sidebar, three-column inbox, side rails |
| 768–1199px | Sidebar collapses to icons, rails stack, inbox drops the context column |
| <768px | Bottom navigation with a dominant `+`, drawers become bottom sheets, inbox swaps list ↔ thread |

Mobile is recomposed, not shrunk: its own header, its own navigation, metrics as
a snap-scrolling strip, and single-column cards.

---

## States

Every one of these is designed, not left to chance:

- **Empty** — says what the area does, why it is empty, and what to do next
- **Loading** — skeletons matched to the real layout; long AI work reports its
  actual steps ("Reading 120 documents… Analysing competitors…") rather than spinning
- **Error** — what happened, why, and the button that fixes it (see a broken
  connection on `/connections`)
- **Success** — toast for small things, a confirmation step for flows
- **Empty search**, **no filter matches**, **disabled**, **destructive confirm**

---

## Motion

One rule: **every animation answers a question.** What changed, where did it come
from, where did it go, what is happening, what needs me, what worked. Nothing
animates decoratively, and only `transform` and `opacity` are animated — both
composite on the GPU and never trigger layout.

| Movement | Duration | Says |
|---|---|---|
| Page content enters (fade + 6px up) | 280ms | You navigated; the shell did not |
| List rows stagger in | 200ms, 22ms apart | These arrived together |
| Button press | 90ms, `scale(.98)` | Received |
| Card hover | 200ms, 1px lift | Clickable |
| Row leaves the queue | 220ms, slide right | Decided and gone |
| Drawer slides in | 280ms | It came from the edge, not from nowhere |
| Modal scales 0.98 → 1 | 200ms | Focus moved here |
| Chart line draws | 700ms, once | Follow the trend |
| AI sparkle breathes | 1.6s loop, only while working | Something is happening |

The scrim is a light 28% black with **no blur** — a drawer belongs to the page
behind it, and blurring the page denies that.

`prefers-reduced-motion` removes every decorative loop (AI breathing, glow,
streaming caret, chart draw) and keeps only essential state changes.

## Interaction notes

- **Command palette** (`⌘K` / `Ctrl K`) — opens on Recent + Suggested rather than
  a blank list, highlights the matched span, sorts prefix matches first, and has
  a real no-results state
- **Rapid review** — Approvals is a queue: decide and the row leaves, the counter
  reads `Reviewed 3 of 5`, and the next item takes focus. `A` approve, `R` reject,
  `E` edit, `J`/`K` move. `?` lists shortcuts. Shortcuts stand down while typing
  and while a dialog is open
- **Optimistic everywhere** — approving from Home ticks the count, drops the card,
  prepends an activity line and updates the sidebar badge without a reload. Undo
  is offered in the toast
- **Buttons have a lifecycle** — default → busy (spinner, width pinned so nothing
  reflows) → `✓ done` → back. Failure restores the original label and explains
- **AI reports work, never spins** — `AITask` shows one live step and completed
  ones, and generated text streams into the editor. Every generation ends with
  *Generated by Sahoda AI* and Copy / Edit / Regenerate / Accept
- **Autosave** in the create flow (`Saving… / Saved just now`), with an
  unsaved-changes guard on close
- **Conflicts surface as decisions** — dragging a post onto a slot that already
  has one on the same channel opens a choice, never a silent overwrite
- **Charts are actionable** — hover any point for value + delta, click it to open
  the campaigns behind that day
- **Deep links** — `/approvals/:id`, `/campaigns/:id`, `/assets/:name`,
  `/conversations/:id` all restore exact state
- **Back preserves context** — the back link names where it returns to, based on
  the trail you actually walked
- **Mobile** — bottom sheets with a drag handle and swipe-to-close; every tappable
  control clears 44px; desktop stays dense
- Detail always opens in a **drawer**, never a page navigation
- `Esc` unwinds one layer at a time: popover → overlay. Focus is trapped inside
  dialogs and handed back on close

---

## Known scope boundaries

- Data is mocked in `js/data.js`; there is no backend, so changes reset on reload.
- Charts are hand-rolled SVG (no chart library) — enough for line, sparkline,
  ring and bar, not for zooming or tooltips.
- Drag and drop is mouse/pointer only; touch reordering is not implemented.
