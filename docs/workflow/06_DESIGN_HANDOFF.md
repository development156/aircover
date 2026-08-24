# 06 · Designer handoff

**The problem:** a designer works in Claude Code on the UI. The founder works in Claude Code on the backend. Both need each other's work, neither should have to think about git.

**The answer:** a shared branch, two commands each, and a document that carries the facts a designer cannot read out of a repository he does not run.

---

## The shape

```
wt-web  ──────────────────────────────────────────  production
   │
   └── wt-design ◄────────────────────────────────  the shared lane
         ▲                                    ▲
         │ designer pushes UI                 │ founder pulls it,
         │ founder pushes structure           │ merges into a build lane
```

**One branch, `wt-design`, both push and pull.** Not two branches merged periodically — that produces divergence nobody notices until it is expensive.

**The designer owns:** `apps/web/src/components/**`, `apps/web/src/app/**/*.tsx` (presentation only), `packages/shared/tokens.css`, `docs/37_Design_System_v5.md`.

**The founder owns:** everything else. Queries, server actions, migrations, packages, jobs, config.

That boundary is what makes the merges trivial. When it is respected, conflicts are rare; when it is not, they are semantic and painful.

---

## Setup — once

**The designer clones and gets on the branch:**

```
git clone git@github.com:IDIVASM/sahodalabs.git
cd sahodalabs
git checkout -b wt-design origin/wt-design
pnpm install
```

**Then env.** `.env` files are gitignored, so they do not clone. The founder sends them separately — over a password manager, never over chat. Three files: `.env`, `apps/web/.env`, `apps/web/.env.local`.

**Or, better for a designer who does not need real data:** a seeded local Postgres via `packages/db/scripts/pgbox.mjs`, with PostgREST in front of it. That gives him a working app with believable content and no access to production at all. It is more setup once and less risk forever.

---

## The two scripts

Put these at `scripts/design-push.sh` and `scripts/design-pull.sh`, `chmod +x` both, and add them to `package.json` as `design:push` and `design:pull`.

**`design-push.sh`** — the designer runs this when he has something to share:

```bash
#!/usr/bin/env bash
set -euo pipefail

BRANCH="wt-design"
MSG="${1:-design: work in progress}"

# Refuse to push from the wrong branch. A push from a detached HEAD or
# from trunk is the one mistake that costs an evening.
CURRENT=$(git branch --show-current)
if [ "$CURRENT" != "$BRANCH" ]; then
  echo "You are on '$CURRENT', not '$BRANCH'. Not pushing."
  exit 1
fi

# Refuse to push a broken build. A red branch blocks the other person.
echo "Building before push…"
pnpm --filter @sahoda/web build

git add -A
git commit -m "$MSG" || echo "Nothing to commit."
git pull --rebase origin "$BRANCH"
git push origin "$BRANCH"

echo "Pushed to $BRANCH."
```

**`design-pull.sh`** — either person runs this to get the other's work:

```bash
#!/usr/bin/env bash
set -euo pipefail

BRANCH="wt-design"

if [ -n "$(git status --porcelain)" ]; then
  echo "You have uncommitted changes. Commit or stash first."
  git status --short
  exit 1
fi

git fetch origin "$BRANCH"
git pull --rebase origin "$BRANCH"

# A pull that changes package.json or tokens needs a reinstall or a
# regenerate. Silently skipping this is how "it works for me" starts.
if git diff --name-only HEAD@{1} HEAD | grep -q "package.json\|pnpm-lock"; then
  echo "Dependencies changed — installing."
  pnpm install
fi
if git diff --name-only HEAD@{1} HEAD | grep -q "tokens.css"; then
  echo "Tokens changed — regenerating inline copy."
  node scripts/gen-tokens-inline.mjs
fi

rm -rf apps/web/.next
echo "Up to date. Run: pnpm dev"
```

Then it is `pnpm design:push "reworked the planner"` and `pnpm design:pull`. That is the whole workflow.

---

## The document the designer actually needs

A designer cannot read structure out of a repository he does not run.
`docs/45_Product_Structure.md` exists for this — 60,507 words, written for a
designer's AI assistant that has never seen the codebase. (It was written as
`docs/35` on the unmerged `wt-handoff` lane and renumbered on 24 August 2026,
because `docs/35` on the trunk is `35_Operations.md`.)

**It contains zero design opinion.** No colours, no spacing, no layout advice — that is his job. What it carries is what he cannot know:

- Every route, what a person does there, and what state it can be in
- Where every value on every screen comes from — a table, an API, a computed value, or the user's own input
- **What the product cannot show, and why.** This is the section that matters most. A reference design full of confident numbers will produce screens this product must refuse.
- The seven distinct kinds of nothing: not connected · read failed · not configured · no data yet · no workspace yet · suppressed by the platform · we could not check today. Different sentences, different remedies.
- The composer's per-channel model, which most reference designs get structurally wrong

**Regenerate it after any structural change.** A stale structure document is worse than none, because he will design against it confidently.

---

## Three rules that keep it seamless

**Small pushes, often.** A designer who works for three days and pushes once creates a merge nobody can review. Push per screen.

**Neither person force-pushes `wt-design`.** A rebase over the other's work loses it silently.

**The founder never edits `components/**` on a build lane.** If a build lane needs a component change, it logs what the screen should show and the designer makes it. That single rule is why the boundary holds.

---

## What the designer should be told about this product

Three things, or he will design something the product cannot ship:

**It never shows a number it cannot prove.** Not as a limitation — as the differentiator. Reference designs are full of "Reach 68K–81K" and "12 competitors tracked", and every one of those must become a container with no figure. His screens must work with an em dash in them.

**Empty states are half the product.** Fifty beta users, day one, nothing connected. The empty version of every screen is the version most people see first, and it must look designed rather than failed.

**Structure carries meaning, not colour.** The product distinguishes measured from inferred by **fill weight, glyph and label** so it survives greyscale and re-theming. A design that codes state by hue alone breaks the one honest thing this product does.
