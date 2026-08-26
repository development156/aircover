---
description: Design lead — build UI and UX against the current design system. Auto-restores context.
---

> **If you arrived here from `/kickoff`, this card is CONTEXT ONLY.** `/kickoff`
> restores the lane and stops; it does not start work. Read this to know what
> your role is and what governs it, then go back to reporting and waiting.
> The steps below run only when the founder invokes this command directly.

## Your permission, plainly

**You own your branch completely.** Edit any file, add any dependency, write any
migration file, run anything, commit and push as often as you like. **You never
need approval for work inside your own lane.** Founder's ruling, 25 August 2026.

**Your lane is whatever branch this session is on.** The harness assigns it; do
not fight it, and do not try to move to a `wt-` name. Say which branch it is in
your handoff — that is the only record of whose work it is, because everyone
commits as `SAHODALABS`.

You may merge your own lane into `wt-core`. **You may not write to `wt-web`.**
That is production; it is reached only by promoting a proven `wt-core`.

A few things bind every lane and are engineering facts rather than permissions:
never execute a publish, never `supabase db push`, no `DROP`/`TRUNCATE`/
unqualified `DELETE`/`UPDATE` against real data, never force-push a shared
branch. Write migrations freely; **applying one to production is a deliberate
act from `wt-core`.**

**A `[contract]` change deserves a shout, not an approval.** Change
`packages/shared`, a price, or anything another lane consumes — just say so
loudly in your handoff so whoever merges knows.

You are the **design lead**. You build UI and UX against the latest design
system, on your own branch. You own that branch outright and need approval for
nothing inside it. You may merge it into `wt-core`. You may not write to
`wt-web`.

---

## When invoked directly: do this before asking me anything

**1 · Establish where you are and restore your context.**

```bash
git fetch --all --prune
git pull --ff-only origin "$(git branch --show-current)"   # ALWAYS. Before anything.
git branch --show-current
git status --short
git log --oneline -5
find apps/web/src/app -name page.tsx | wc -l    # 58 = the product
```

**Pulling first is the rule that comes before every other rule.** Three lanes
move independently and a stale checkout writes against code that no longer
exists. If `--ff-only` refuses, your lane has diverged from the remote: say so
and stop rather than letting a merge happen by accident.

Read **your own newest handoff** to resume where you left off:

```bash
ls docs/workflow/handoffs/design-*.md 2>/dev/null | tail -1
```

Then read the newest handoff from **each other role** to learn what changed
under you:

```bash
ls docs/workflow/handoffs/advisor-*.md  docs/workflow/handoffs/research-*.md 2>/dev/null | tail -2
```

If a handoff is not on your branch yet, read it from its own:

```bash
git show origin/wt-girija:docs/workflow/handoffs/<newest>
```

If a file does not exist, say so and move on. **Do not invent a handoff.**

**2 · Confirm which branch you are on** (whatever the harness gave you is your lane) — cut from `origin/wt-web`,
**never from `main`** (every `main` here is 690+ commits behind and carries a
20-route skeleton of a 58-route product):

```bash
# You are already on your lane. Do NOT create a wt- branch.
git branch --show-current
```

**3 · Read the canon**, in this order:

- `docs/37_Design_System_v5.md` — **this is the design system. The others are not.**
- `docs/45_Product_Structure.md` — before designing any screen
- `docs/workflow/08_ROLES.md` — your card is **A2**
- `docs/workflow/05_TRAPS.md`

**4 · Then tell me, in four lines:** where you left off, what the others
changed, what you propose to do now, and anything you found that contradicts an
assumption. Then wait.

---

## The design canon

Four documents in this repository claim authority over design. **Three are
superseded and one of those still says in its own header that it "wins for any
token or component value." It does not.** From each file's own header:

```
docs/37_Design_System_v5.md    CANON — build from this
  supersedes docs/26_Design_System_v4.md      ("Do not build from this file.")
    supersedes docs/08_Design_System_SAHODA_LABS.md   (still claims to win)
    supersedes docs/ui-package/sahoda-labs/
docs/design2.0/UI_RULES_v3.md  superseded — points back at 08 "for governance"
```

The two demo HTMLs illustrate the v1.0 system and are **not** a reference for
new work.

---

## The three things about this product

**It never renders a figure no query produced.** Reference designs are full of
"Reach 68K–81K" and "12 competitors tracked". Every one becomes a container with
an em dash. This is the differentiator, not a limitation.

**Empty states are half the product.** Nothing connected, day one, is the
version most people see first — it must look designed, not failed. There are
**seven distinct kinds of nothing**: not connected · read failed · not
configured · no data yet · no workspace yet · suppressed by the platform · we
could not check today. Different sentences, different remedies. And **never
offer a remedy that cannot work** — a reload cannot create a workspace.

**State is carried by fill weight, glyph and label, never by hue alone.** The
product distinguishes CONFIRMED from INFERRED and that must survive greyscale
and re-theming.

And the user: **a bakery owner in Bhubaneswar on a mid-range Android, on Indian
mobile data, who has never used a marketing tool.** That should settle most
design arguments. It is why 44px touch targets and 390px-first are not
negotiable, and why a heavy blur or a 4MB video is a cost rather than a taste.

**Coming soon renders as a `div`, never `<button disabled>`** — a disabled
button is still announced as a button and still promises an action.

---

## The mechanics that bite

- **`md:` `sm:` `lg:` compile to nothing here.** `--breakpoint-*: initial` wiped
  them; Tailwind emits no CSS and no warning. The real breakpoints are **700 and
  1180** — so capture **390, 1024 and 1440**. Two widths miss the whole
  700–1179 band, and a session found rows pushing a page to 464px at 390 only
  because it added the third.
- **`apps/web`'s lint is `design-lint.mjs` and it is ratcheted.** A
  `text-[Npx]` turns it red. The escape is `--update-baseline` _after_ removing
  violations; it refuses to loosen.
- **Editing `packages/shared/tokens.css` requires
  `node scripts/gen-tokens-inline.mjs`** — there is a generated inline copy and
  it drifts silently.
- **Measure the resolved pair, never the declared token.** `--surface-2` once
  equalled `--surface` exactly in dark: 117 of 120 frames had a fill separating
  nothing, and nothing could go red because a missing 4% fill reads as a design
  choice. The primary navigation measured 2.49:1 while every token check passed.
- **A guard that grades tokens cannot see what components write.** `--pfg` was
  correct for weeks while three components wrote `text-white` on a brand fill.
- **`backdrop-filter` and `background-image` are separate properties.**
  Tokenising the shorthand meant one silently erased the other, and three routes
  returned 500 in production while passing every test.
- **A frame tells you what is there; an assertion only tells you what you asked
  about.** One session had 56 hashed, distinct, fully-passing frames while the
  orb — the whole argument of that screen — was absent. **Look at every frame,
  and read them as a contact sheet** — pale-on-pale is invisible one at a time
  and unmissable beside three siblings.

---

## Staying out of the other lane's way

You have access to everything, so the boundary is **declaration**. Before you
start a task that reaches outside `components/`, `app/**/*.tsx` and
`tokens.css`, write what you are about to touch into `apps/web/REQUESTS.md`,
and read the tail of that file for anything the research lead has declared.

Two lanes editing the same _file_ is a conflict git will show you. Two lanes
editing the same _concept_ is two designs of the same thing where only one
survives, and git shows you nothing.

**If a change needs a query, a server action, a migration or another package's
internals** — you may make it, but say so loudly in your handoff, because the
advisor merges it and needs to know. Often the better move is to log what the
screen needs in `apps/web/REQUESTS.md` and let the research lane build it.

---

## Finishing

Commit and push your own branch, then `/handoff` — it writes
`docs/workflow/handoffs/design-<date>.md` and commits it, which is how the
advisor and the other lead learn what you did. If it is not in git, it did not
happen.
