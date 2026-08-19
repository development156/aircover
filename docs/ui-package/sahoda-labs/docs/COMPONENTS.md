# Component reference

Every CSS component with its required markup. Copy the markup exactly — most
components depend on element order or a specific nesting.

Tokens live in `css/tokens.css`; nothing below hardcodes a colour.

---

## Buttons

```html
<button class="btn">Default</button>
<button class="btn btn--primary">Primary action</button>
<button class="btn btn--ink">Secondary emphasis</button>
<button class="btn btn--ghost">Quiet</button>
<button class="btn btn--accent-ghost">AI action</button>

<button class="btn btn--sm">Small (28px)</button>
<button class="btn btn--lg">Large (40px)</button>
<button class="btn btn--block">Full width</button>
<button class="btn btn--icon" aria-label="More">…</button>

<button class="btn" disabled>Disabled</button>
<button class="btn" aria-disabled="true">Disabled (still focusable)</button>
```

Sizes: `--control-h` 34px default · 28px small · 40px large. Icons inside are
auto-sized to 15px (13px small).

**One primary per view.** If two buttons are orange, neither is primary.

### Icon buttons

```html
<button class="iconbtn tip" data-tip="Notifications" aria-label="Notifications">
  <!-- icon('bell') -->
  <span class="iconbtn__dot">3</span>
</button>
```

### Lifecycle

Never set busy/success markup by hand — use `runAction()` (see API.md). It pins
the width so the layout cannot shift.

---

## Cards

```html
<section class="card">
  <div class="card__head">
    <span class="sec-title">Title</span>
    <span class="count">3</span>
    <a class="link push" href="#/x">View all →</a>
  </div>
  <div class="card__body">…</div>
  <div class="card__foot">…</div>
</section>
```

| Class | Use |
|---|---|
| `.card` | Hairline border, no shadow. The default. |
| `.card--line` | Stronger border — nested cards |
| `.card--pad` | Padded body without `.card__body` |
| `.card--int` | **Interactive** — hover lift + shadow, pointer cursor |

Only add `.card--int` if the whole card is clickable. Hover feedback on a
non-clickable card is a lie.

`.push` is the utility that shoves an element to the right of a flex row.

---

## Status badges — the four-rung ladder

Status is **never** carried by hue. It is carried by fill weight, a glyph and a
label. Prefer `statusBadge(status)` over writing these by hand.

```html
<span class="badge badge--urgent">! Overdue</span>    <!-- rung 1: shouts -->
<span class="badge badge--active">Active</span>       <!-- rung 2: current -->
<span class="badge badge--pending">! Review</span>    <!-- rung 3: needs a look -->
<span class="badge badge--calm">✓ Scheduled</span>    <!-- rung 4: resolved -->
<span class="badge badge--soft">Neutral</span>
```

| Rung | Appearance | Meaning |
|---|---|---|
| 1 | Solid orange | Overdue, urgent, broken. **The only thing that shouts.** |
| 2 | Solid black | Active, current, selected |
| 3 | Orange outline | Pending, in review |
| 4 | Grey outline | Done, scheduled, informational |

If everything is rung 1, nothing is. Reserve it.

### Counts and dots

```html
<span class="count">2</span>              <!-- orange, needs attention -->
<span class="count count--ink">12</span>  <!-- neutral, informational -->

<span class="dot dot--on"></span>Connected     <!-- always paired with a label -->
<span class="dot dot--off"></span>Disconnected
```

A dot alone is not a status. It always sits next to text.

---

## Forms

```html
<div class="field">
  <label class="label" for="x">Label</label>
  <input class="input" id="x" placeholder="…">
  <div class="hint">Helper text</div>
</div>

<div class="field">
  <input class="input input--error">
  <div class="hint hint--error">What went wrong and how to fix it</div>
</div>

<div class="input-wrap">
  <!-- icon('search') --><input class="input" placeholder="Search…">
</div>

<select class="select">…</select>
<textarea class="textarea" rows="4"></textarea>

<input type="checkbox" class="check">
<input type="checkbox" class="check check--radio">
<input type="checkbox" class="switch">
<input type="range" class="slider">
```

Heights: input 38px, control 34px. Focus is an orange ring plus a 3px halo.

---

## Tabs, chips, segments

```html
<!-- Segmented: switching views of the same data -->
<div class="seg">
  <button class="seg__i is-on">Calendar</button>
  <button class="seg__i">Board</button>
</div>

<!-- Underline: navigating sections of a page -->
<div class="utabs">
  <a class="utabs__i is-on" href="#/brand/overview">Overview</a>
  <a class="utabs__i" href="#/brand/identity">Identity</a>
</div>

<!-- Chips: filters -->
<div class="chips" role="tablist">
  <button class="chip is-on" role="tab" aria-selected="true">All<span class="chip__n">5</span></button>
  <button class="chip">Urgent<span class="chip__n">1</span></button>
</div>
```

Filter chips should always carry their count. A filter that might be empty is
worth knowing about before you click it.

---

## Lists and tables

```html
<div class="lrow" tabindex="0" role="button" aria-label="…">
  <span class="tile tile--brand">…</span>
  <div class="grow" style="min-width:0">
    <div class="t-13 w-600 truncate">Title</div>
    <div class="t-12 t-2 truncate">Description</div>
  </div>
  <div class="row g2" style="flex:none">…actions…</div>
</div>
```

`.lrow.is-cursor` marks the keyboard position (orange bar + tint).
`.lrow.is-leaving` animates a decided row out — use `removeRow()`.

`min-width: 0` on the growing child is required, or `.truncate` will not work
inside flex.

```html
<div class="table-wrap">   <!-- horizontal scroll container -->
  <table class="table">
    <thead><tr><th>Channel</th><th class="num">Reach</th></tr></thead>
    <tbody><tr><td>…</td><td class="num">96.4K</td></tr></tbody>
  </table>
</div>
```

`.num` right-aligns and applies tabular figures. Every numeric column needs it,
or the digits will not line up.

---

## Avatars and platform tiles

```html
<span class="av">MP</span>
<span class="av av--accent av--lg">S</span>
<span class="av av--xl"><img src="…" alt=""></span>

<div class="av-stack"><span class="av av--sm">A</span><span class="av av--sm">B</span></div>
```

Sizes: 22 · 28 · 36 · 56px.

### Platform tiles ⚠

```html
<!-- Correct — logo fills the slot, no chrome -->
<span class="tile tile--brand"><!-- brandIcon('instagram') --></span>

<!-- Correct — UI icon, keeps the container -->
<span class="tile"><!-- icon('file') --></span>
```

**The rule:** a *brand logo* gets `.tile--brand`, which removes the background
and border and lets the mark fill its slot. Every one of these marks already
ships its own plate, radius and colour — a second grey well around it is a box
inside a box, and it makes a strong mark look tentative.

A *UI icon* keeps the plain `.tile`, because a thin monochrome glyph genuinely
needs a container to have presence.

Use `platformTile(key, size)` and this is handled for you.

---

## Progress

```html
<div class="bar"><div class="bar__f" style="width:62%"></div></div>
<div class="bar"><div class="bar__f bar__f--ink" style="width:62%"></div></div>
```

Rings via `ring(value, { size, stroke, label })`. Always label what a ring
measures — a bare percentage next to a due date is ambiguous:

```html
<span class="tip" data-tip="75% ready to publish" aria-label="75% ready to publish">
  <!-- ring(75) -->
</span>
```

---

## Overlays

Use `drawer()`, `modal()`, `confirmDialog()` rather than writing these. The
structure, for reference:

```html
<div class="scrim"></div>
<div class="drawer" role="dialog" aria-modal="true">
  <div class="drawer__head">…<button data-close>×</button></div>
  <div class="drawer__body">…</div>
  <div class="drawer__foot">…</div>
</div>
```

`.drawer` · `.drawer--wide` (760px) · `.modal` · `.modal--lg` (880px) ·
`.sheet`. On mobile, drawers and modals become bottom sheets automatically.

Any `[data-close]` element closes the overlay.

---

## Feedback

```html
<!-- Inline banner -->
<div class="banner">
  <!-- icon('info') -->
  <div><div class="banner__t">Title</div><div class="banner__d">Detail</div></div>
</div>

<div class="banner banner--alert">…</div>   <!-- needs attention -->
```

```html
<!-- Empty / error state -->
<div class="state">
  <div class="state__ic state__ic--accent"><!-- icon --></div>
  <div class="state__t">No campaigns yet</div>
  <div class="state__d">Create your first campaign and let AI handle execution.</div>
  <div class="state__a"><button class="btn btn--primary btn--sm">Create campaign</button></div>
</div>
```

Every empty state answers three things: what this area does, why it is empty,
what to do next. Use `emptyState()` / `errorState()`.

```html
<!-- Skeletons — must mirror the real layout -->
<div class="sk sk--title"></div>
<div class="sk sk--text"></div>
<div class="sk sk--block"></div>
<div class="sk sk--av"></div>
```

A skeleton that does not match the content it replaces causes a visible jump on
load, which is worse than a spinner.

---

## AI surfaces

```html
<span class="ai-mark"><!-- icon('sparkle') --></span>
<span class="ai-mark is-live">…</span>   <!-- breathes while working -->

<div class="ai-note">
  <span class="ai-mark">✦</span>
  <div><div class="ai-note__t">AI reasoning</div>
       <div class="ai-note__d">Recommends publishing at 10:00 AM…</div></div>
</div>

<span class="ai-sig">✦ Generated by Sahoda AI</span>

<span class="thinking" role="status"><span>Working</span><i></i><i></i><i></i></span>
```

**Two distinct signals, do not mix them:**
- The **sparkle** marks AI-generated *content* — inline, small, everywhere.
- The **mascot face** is the *assistant as a character* — headers, task panels,
  big moments.

Using both in one header is redundancy, not emphasis.

### Task panel

```html
<div class="aitask">
  <div class="aitask__s is-done"><span class="aitask__m">✓</span><span>Researching audience</span></div>
  <div class="aitask__s is-live"><span class="aitask__m"></span><span>Generating strategy</span></div>
  <div class="aitask__s"><span class="aitask__m">✓</span><span>Creating content</span></div>
</div>
```

Built by `AITask.mount()`. One live step at a time.

### Mascot

```html
<span class="mface" role="img" aria-label="AI is working"><img src="mascot/13.png" alt=""></span>
<span class="mface mface--sm">…</span>   <!-- 30px -->
<span class="mface mface--lg">…</span>   <!-- 52px -->
<span class="mface mface--xl">…</span>   <!-- 84px -->
```

The black screen with a light bezel is drawn in CSS; only the face is an image.
That containment is what keeps the character's green/amber/blue/red out of the
five-colour UI palette.

---

## Utilities

Layout:
```
.row .row-t .col .between .center .wrap .grow .push
.g1–.g6                      gap 4/8/12/16/20/24px
.grid .g-2 … .g-6            equal columns
.mt1–.mt6 .mb2–.mb4          margins
```

Type:
```
.t-11 … .t-24                font sizes
.t-2 .t-3                    secondary / tertiary text
.t-accent                    orange
.w-500 .w-600 .w-650         weights
.truncate .clamp-2           overflow
.tabnum                      tabular figures — use on ALL numbers in columns
```

Structure:
```
.page__in .page__hd .page__tools .toolbar
.split .split--wide          content + rail
.snav                        settings-style nav + panel
.sep .vsep .kbd .tip[data-tip]
.hide .sr                    hidden / screen-reader only
```

---

## Motion classes

```
.page-in        content entry (fade + 6px up, 280ms)
.stagger        children settle in sequence, capped at 8
.is-leaving     row exits right
.is-cursor      keyboard focus row
.is-busy        button working
.is-done        button success
.spinner        13px spinner, inherits currentColor
.num-tick       a number changed
.chart-line     draws once on entry (needs pathLength="1")
```

All of these are removed or neutralised under `prefers-reduced-motion`.

---

## Rules worth restating

1. **Five colours.** Orange, black, grey, gainsboro, white. Everything else is
   one of them at reduced alpha. The only exceptions are platform logos and the
   mascot's face, both contained.
2. **Status is never hue alone.** Fill weight + glyph + label.
3. **Orange is rationed.** One primary action per view.
4. **Hairline first.** Shadows are for things that genuinely float.
5. **Every number that sits in a column gets `.tabnum`.**
6. **Every interactive element has all eight states**: default, hover, focus,
   active, disabled, loading, success, error.
