# Documentation

Reference material for Sahoda Labs — the AI marketing operating system UI.

## Start here

| If you want to… | Read |
|---|---|
| **Everything in one document** | [`../SPECIFICATION.md`](../SPECIFICATION.md) |
| Understand the product and the design system | [`../README.md`](../README.md) |
| **Retheme an existing dashboard without touching its logic** | [`../theme/RETHEME.md`](../theme/RETHEME.md) |
| Rebuild this properly, screen by screen | [`../IMPLEMENTATION.md`](../IMPLEMENTATION.md) |
| Understand how the code is wired | [`ARCHITECTURE.md`](ARCHITECTURE.md) |
| Look up a function | [`API.md`](API.md) |
| Know what your API must return | [`SCHEMA.md`](SCHEMA.md) |
| Build a screen with these components | [`COMPONENTS.md`](COMPONENTS.md) |
| Know what exists and why | [`FEATURES.md`](FEATURES.md) |

## Suggested reading order

**Designer / PM** → main README → FEATURES → COMPONENTS

**Frontend engineer porting it** → IMPLEMENTATION → ARCHITECTURE → COMPONENTS → API

**Backend engineer** → SCHEMA (only) — it is the API contract

---

## The five things that matter most

If nothing else survives the port, these should:

1. **Status is never carried by hue.** Four rungs of fill weight + glyph + label.
2. **Optimistic mutations with undo**, not spinners and confirm dialogs.
3. **AI reports work** — staged steps and streamed text, never an opaque wait.
4. **Errors name a cause and carry the button that fixes them.**
5. **Mobile is recomposed, not shrunk.**

---

## Running it

Open `index.html`. No build step, no dependencies, no server required — it runs
from `file://`.

The only network request is the Inter webfont, and it degrades to the system
stack offline.

---

## Verifying a change

```bash
# syntax
for f in js/*.js js/pages/*.js; do node --check "$f"; done

# runtime errors across every route
for r in home approvals planner campaigns brand analytics \
         conversations assets connections settings; do
  chrome --headless=new --disable-gpu --virtual-time-budget=3000 \
    --enable-logging=stderr --v=0 --screenshot=/dev/null \
    "file:///path/to/index.html#/$r" 2>&1 | grep -iE 'Uncaught|TypeError'
done

# the palette has not drifted
grep -rhoiE '#[0-9a-f]{3,8}' css/ | sort -u
```

The palette check should return only: `#FF6600 #000000 #575756 #DCDCDC #FFFFFF`,
the achromatic surface steps (`#FAFAFA #F4F4F4` and the dark-theme near-blacks),
and `#FDF3EC` — the peach ground matched to the greeting banner artwork.

Anything else is a regression.
