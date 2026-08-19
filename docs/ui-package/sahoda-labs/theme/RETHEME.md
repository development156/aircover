# Retheme kit — keep your dashboard, take this look

Your working dashboard already does the job. This kit moves the **Sahoda
Labs appearance** onto it — the fonts, the colours, the control shapes, the
motion — **without touching a single function, route, query or handler**.

Nothing here knows what your app does. It only knows what it should look
like.

---

## What is in the folder

| File | What it does | Who needs it |
|---|---|---|
| `sahoda-tokens.css` | The palette, type scale, spacing, radii, shadows, focus ring | **Everyone. Always first.** |
| `sahoda-components.css` | 40+ `sl-`prefixed components | Anyone not on shadcn — and everyone, for the six pieces shadcn lacks |
| `sahoda-shadcn.css` | Retheme shadcn via its own variables | Tailwind **v3** + shadcn |
| `sahoda-shadcn-v4.css` | Same, newer variable format | Tailwind **v4** + shadcn |
| `tailwind-sahoda.preset.js` | Tokens as Tailwind utilities | Tailwind v3 |

Every class is prefixed `sl-`. **Nothing collides.** Import the files and
your app looks identical until you opt in.

---

## 1. Pick your path

**Find out which you are** — open your `globals.css`:

```
--background: 0 0% 100%;        →  Path A   (Tailwind v3 + shadcn)
--background: oklch(1 0 0);     →  Path A4  (Tailwind v4 + shadcn)
no such file / plain CSS        →  Path B
```

Loading the wrong shadcn bridge produces an all-black or all-transparent
app. It is worth the ten seconds to check.

### Path A — shadcn (about 20 minutes)

The fastest route by a wide margin, because shadcn components read their
colours from variables. Redefine the variables and **every Button, Card,
Table, Dialog, Input and Badge you already shipped becomes Sahoda with
zero component edits.**

```css
/* app/globals.css — order matters, these must win */
@import "tailwindcss";
@import "../theme/sahoda-tokens.css";
@import "../theme/sahoda-shadcn.css";      /* or -v4 */
```

Then add the font (§2) and the six components shadcn has no answer for
(§4). That is the whole port.

### Path A4 — Tailwind v4 + shadcn

Identical, but paste the `:root` and `.dark` blocks from
`sahoda-shadcn-v4.css` **over** the ones shadcn generated. Leave the
`@theme inline` block alone — it already points at those names.

### Path B — plain CSS, CSS modules, styled-components, MUI, anything else

```html
<link rel="stylesheet" href="theme/sahoda-tokens.css">
<link rel="stylesheet" href="theme/sahoda-components.css">
```

Then work through §3's mapping table one screen at a time. Start with the
screen you look at most — you will see whether the port is working before
you have spent a day on it.

---

## 2. The font (do this first — it is a third of the look)

Inter, at **six weights**. 550 and 650 are load-bearing, not decoration:
the UI separates a label from its value with a half-step rather than
jumping to bold. Drop them and everything reads flatter.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;650;700&display=swap" rel="stylesheet">
```

Next.js:

```js
import { Inter } from 'next/font/google';
const inter = Inter({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-inter' });
```

> `next/font` only accepts standard weights. Inter is a variable font, so
> 550 and 650 still work if you load it as a variable font
> (`weight: 'variable'`) — otherwise they round to 500 and 600 and the
> hierarchy softens slightly. Not fatal; worth knowing why it looks a
> touch flatter than the reference.

**Base size is 13px, not 16px.** This is the second biggest reason the
reference feels denser than a stock dashboard. `sahoda-tokens.css` sets it
on `body`. If your app fights that, set it on your app root instead.

---

## 3. Class mapping

Left is what you probably have. Right is the replacement.

### Buttons

| You have | Use | Notes |
|---|---|---|
| `<Button>` / `.btn-primary` | `sl-btn sl-btn--primary` | Solid orange. **Ration these — one per view.** |
| `.btn-secondary` / `.btn-default` | `sl-btn` | White with a hairline ring. The workhorse. |
| `.btn-dark` | `sl-btn sl-btn--ink` | Solid black. For the second-strongest action. |
| `.btn-link` / `.btn-text` | `sl-btn sl-btn--ghost` | No fill until hover. |
| `.btn-outline-primary` | `sl-btn sl-btn--accent-ghost` | Orange outline. |
| **`.btn-danger` / destructive** | `sl-btn sl-btn--ink` | ⚠ **There is no red.** See §5. |
| `.btn-sm` / `.btn-lg` | `sl-btn--sm` / `sl-btn--lg` | 28 / 34 / 40px. |
| icon-only | `sl-iconbtn` | 32px, for headers and toolbars. |

### Status and data

| You have | Use |
|---|---|
| `.badge-danger`, "Overdue", "Action needed" | `sl-badge sl-badge--urgent` |
| `.badge-primary`, "Active", "Running", "Live" | `sl-badge sl-badge--active` |
| `.badge-warning`, "Pending", "In review" | `sl-badge sl-badge--pending` |
| `.badge-success` / `.badge-secondary`, "Done", "Scheduled" | `sl-badge sl-badge--calm` |
| green ↑ / red ↓ percentage | `sl-delta sl-delta--up` / `--down` |
| `<Progress>` | `sl-bar` + `sl-bar__f` |
| donut / gauge | `sl-ring` (see the markup comment in the CSS) |
| unread count | `sl-count` |

**Read §5 before you map a status.** The rung is chosen by *urgency*, not
by whether the old class was red or green — "Failed" and "Needs approval"
are both rung 1, and "Completed" and "Cancelled" are both rung 4.

### Structure

| You have | Use |
|---|---|
| `<Card>` | `sl-card` (+ `sl-card__head` / `__body` / `__foot`) |
| `<Table>` | `sl-table`, wrapped in `sl-scroll-x` |
| numeric cell | `<td class="sl-num">` |
| `<Tabs>` switching a *view* | `sl-seg` + `sl-seg__i` |
| `<Tabs>` navigating *sections* | `sl-utabs` + `sl-utabs__i` |
| filter pills | `sl-chips` + `sl-chip` |
| `<Input>` / `<Select>` / `<Textarea>` | `sl-input` / `sl-select` / `sl-textarea` |
| `<Checkbox>` / `<Switch>` | `sl-check` / `sl-switch` |
| `<Avatar>` | `sl-av` |
| `<Skeleton>` | `sl-sk` + a shape modifier |
| empty state | `sl-state` |
| error / warning callout | `sl-banner` |
| `<Toast>` / `<Sonner>` | `sl-toasts` + `sl-toast` |

Active state on tabs, chips and segmented controls is **`is-on`**, not
`data-state="active"`. One class name across the kit.

---

## 4. The six pieces that make it Sahoda

Colour alone gets you a dashboard that is orange. These are what make it
*this* dashboard. If you are on shadcn and skipping the rest of the kit,
take these anyway.

**1. The four-rung status ladder** — `sl-badge--urgent|active|pending|calm`.
Status carried by fill weight + glyph + label, never by hue. Full reasoning
in §5.

**2. Platform logos with no container** — `sl-tile sl-tile--brand`. A logo
inside a grey bordered box is a box inside a box.

```html
<span class="sl-tile sl-tile--brand"><img src="icons/instagram.png" alt=""></span>
```

**3. `sl-delta`** — change indicators where the *arrow* carries direction.
A drop in bounce rate is good news; colour alone would call it bad.

**4. `sl-ai-note`** — the surface that explains what the AI did and why.
This is the difference between a supervision tool and a black box.

**5. `sl-state`** — empty and error states are the *same component*,
because both answer the same two questions: what is this, and what do I do
next. `sl-state__a` is not optional.

**6. `sl-mface`** — the mascot's four expressions, driven by one function
reading the same store the pages read, so it can never contradict the UI.

---

## 5. ⚠ There is no red

The palette is five colours and none of them is red, amber or green. If
you map "destructive" to red you have left the design system on your very
first screen.

Status is carried by **three stacked signals**:

| | Signal | Rung 1 | Rung 2 | Rung 3 | Rung 4 |
|---|---|---|---|---|---|
| | **fill** | solid orange | solid ink | orange outline | grey outline |
| | **glyph** | `!` | `●` | `◷` | `✓` |
| | **label** | "Needs approval" | "Running" | "In review" | "Published" |

Loudest to quietest is **urgency**, not good-to-bad. "Failed" and "Needs
approval" are both rung 1 — both need you now. "Completed" and "Cancelled"
are both rung 4 — neither needs anything.

This is not a workaround for a limited palette. It survives greyscale, a
photocopier and colour-blind viewers, and every rung still says what it
means in words — which the traffic-light convention it replaces never did.

**Never add a fifth rung.** If something does not fit, it belongs on an
existing rung and the label does the work.

A destructive button still reads as dangerous because it is solid and it
says **"Delete"** — not because it is a different colour. If you genuinely
need red, that is a palette decision to take with whoever owns the brand,
not a CSS one to take alone.

---

## 6. The behaviours that carry the feel

CSS gets you the look. These four get you the *feel*, and each is a few
lines. Skip them and it will look right and feel like a different product.

### Pin the button width before you change its label

The single cheapest fix in the whole kit.

```js
function busy(btn) {
  btn.style.width = btn.offsetWidth + 'px';   // ← measure BEFORE the swap
  btn.classList.add('is-busy');
  return () => { btn.classList.remove('is-busy'); btn.style.width = ''; };
}
```

Without the pin, "Approve" → "Approving…" shifts every control to its
right. It is the difference between async UI that feels engineered and
async UI that feels improvised.

### Mutate optimistically, offer Undo

```js
row.classList.add('is-going');                 // animates out AND collapses
setTimeout(() => row.remove(), 260);
count.textContent = --pending;                 // every counter, same tick
count.classList.add('sl-tick');
toast('Approved', { action: 'Undo', onAction: restore });
```

Undo in the toast is what lets the action be instant instead of gated
behind "Are you sure?" — the cost of being wrong drops to one click, so
the confirm dialog stops earning its interruption.

### One theme system, one attribute

```js
const dark = localStorage.getItem('theme') === 'dark';
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.documentElement.classList.toggle('dark', dark);   // for Tailwind
```

Set **both** or pick one and use it everywhere. Two theme systems running
side by side is the fastest way to get a light component inside a dark
panel, and it always shows up in the one screen you did not test.

### Animate the page, never the shell

```js
content.classList.remove('sl-page-in');
void content.offsetWidth;          // reflow — restarts the animation
content.classList.add('sl-page-in');
```

A sidebar that re-animates on every navigation makes the app feel like it
is reloading instead of responding.

---

## 7. Do not bring these across

- **`js/data.js`** — mock data. Your API already works; leave it alone.
- **The fake `setTimeout` latency** in the AI flows. Keep the *staged step
  display*, drive it from real progress. Faking progress with a timer is
  the one thing that will make the UI feel dishonest.
- **`Connections.failOnce`** — a deliberate demo failure so the recovery
  path had to be designed. Delete it; keep the failure **UI**.
- **`js/pages/*.js`** — these are specifications, not code. Read them for
  behaviour, do not port them.

---

## 8. Verify

Work down this list. Each line is something that has actually gone wrong.

- [ ] `grep -rhoiE '#[0-9a-f]{3,8}' your-css/ | sort -u` returns only
      `#FF6600 #000000 #575756 #DCDCDC #FFFFFF`, the achromatic surface
      steps, and `#FF9B57` if you use the chart ramp. **Anything else is a
      regression** — usually a red that crept back in.
- [ ] No component is light inside a dark panel. Check a dialog, a
      dropdown and a toast in dark mode — those three are where a second
      theme system always surfaces.
- [ ] Buttons do not change width when they go busy.
- [ ] Focus is visible on every interactive element, and trapped inside
      dialogs.
- [ ] Every empty state says what the area does and what to do next.
- [ ] Every error names a cause and carries the button that fixes it.
- [ ] `prefers-reduced-motion` removes decoration but keeps state changes.
- [ ] At 375px wide: nothing scrolls sideways, targets are ≥44px, inputs
      are 16px so iOS does not zoom on focus.
- [ ] Print a screen in greyscale. Every status is still readable. If it
      is not, something is carrying meaning in hue.

---

## 9. When it looks wrong

| Symptom | Cause |
|---|---|
| Everything black, or invisible | Wrong shadcn bridge. Triplets vs colour values — recheck §1. |
| Colours right, feels puffy and sparse | Control heights and base font size. 34px and 13px, not 40px and 16px. |
| Cards look heavy | You kept `border` *and* the inset ring. Use the ring only. |
| Orange everywhere, nothing stands out | Primary is rationed to one per view. Everything else is `sl-btn`. |
| Hover states dead in dark mode | You have `[data-theme]` but not `.dark`, or the reverse. Set both. |
| Type looks flat vs the reference | Weights 550/650 did not load. See §2. |
| A background image silently 404s | A `url()` inside a **custom property** resolves against the *stylesheet*, not the document. Set `el.style.backgroundImage` directly, or `import` the asset so the bundler resolves it. This one costs an afternoon if you do not know it. |

---

## 10. If you want the port done for you

Copy the working dashboard into this folder — or point me at the repo —
and I will do the mapping screen by screen against your real components
instead of a generic table. The kit above is what I can build without
seeing your code; the port itself is faster and more exact with it.
