# 08 · Lanes and permission

**Founder's ruling, 25 August 2026.** Each lane is autonomous inside its own
branch. There is exactly one gated step in this whole system, and it is
`wt-core → wt-web`.

---

## The flow

```
   your lane            your lane            your lane
  (Girija)              (Jiban)              (Divas)
      │                    │                    │
      │   full autonomy    │   full autonomy    │   full autonomy
      │   no approvals     │   no approvals     │   no approvals
      └────────────────────┼────────────────────┘
                           ▼
                        wt-core          ← all three merge in here
                           │
                      (proven here)      ← THE one gate
                           ▼
                        wt-web           ← production. Vercel deploys this.
```

| | Inside your own lane | Into `wt-core` | Into `wt-web` |
|---|---|---|---|
| **Write code** | **yes, anything** | yes, merge your own lane | **no** |
| **Ask permission first** | **no. Never.** | no | — |
| **Run the gate** | yes, your own | yes | yes |
| **Write a migration** | **yes** | yes | **no** |
| **Apply a migration to production** | no | no | **only from `wt-core`, deliberately** |

**Nobody needs advisor sign-off to work.** That was the old model and it is
gone. You own your branch completely: edit any file, add any dependency, write
any migration file, run anything, commit and push as often as you like.

**The only thing you may not do is write to `wt-web`.** It is production, it is
what Vercel deploys, and it is reached only by promoting a proven `wt-core`.

---

## Your lane is whatever branch your session is on

**Do not fight the harness over branch names.** A Claude Code cloud session
assigns its own branch — `claude/lead-design-7m7ios`, `claude/advisor-qvz5wn`
and so on. That is your lane. Work on it, push it, and say which it is in your
handoff.

MEASURED 25 August 2026: 42 commits of real work already live on three
harness-named branches while `wt-girija`, `wt-jiban` and `wt-divas` sat empty at
`bc9b97b4`. The names were never the point. **What matters is that your work
reaches `wt-core`, and that your handoff says whose it is** — because everyone
commits as `SAHODALABS` and `git blame` can never tell the lanes apart.

So the identity chain is: **handoff names the person · branch names the lane ·
`git log --first-parent wt-core` names which lane each merge came from.**

---

## Merging into `wt-core`

You may merge your own lane in. Before you do:

```bash
git fetch --all --prune
git log --oneline origin/wt-core..HEAD          # what you are actually adding
git diff --name-only origin/wt-core...HEAD      # what you are actually touching
```

**Then check what the other lanes touched, because that is the failure git will
not show you.** Two lanes editing the same *file* is a conflict git raises. Two
lanes editing the same *concept* is two designs of the same thing where only one
survives, silently. The worst instance in this project: one lane fixed a
double-charge in `onboarding-flow.tsx` while another replaced that whole stage
with `OnboardingStage`, making the file unreachable. **Merging would have killed
a money guard and nothing would have failed.**

```bash
# every file more than one lane has touched
for b in <lane-a> <lane-b> <lane-c>; do
  git diff --name-only origin/wt-web...origin/$b
done | sort | uniq -d
```

**Run the full gate after every single merge into `wt-core`, not at the end.**
Otherwise you cannot tell which merge went red.

**Take the tightest ratchet, never the last one written.** Four lanes once ended
with four different `design-lint` baselines. Loosening a ratchet during a merge
is how it stops meaning anything.

---

## Promoting `wt-core` to `wt-web`

This is the one gated step. Before it:

- **Full `pnpm gate`, unpiped**, each leg named PASS / FAIL / UNRUN. Never
  `pnpm gate | tail` — a pipe returns *tail's* exit code.
- **A leg under one second is a cache replay** and verified nothing. Force it.
- **Group failures by error message, never count them.** Six unrelated suites
  red at once is an environment; one test failing is a diff.
- `turbo build` as well: it sat outside the gate for 27 runs while a production
  build error survived, invisible to typecheck because the types resolve fine.
- The HEAD being deployed must be authored `SAHODALABS
  <development@sahodalabs.com>` or **Vercel blocks the deployment**.

---

## Things that are engineering facts, not permissions

These bind every lane, including inside your own branch. They are not approvals
you can be granted; they are the shape of the system.

- **Nobody executes a publish.** It posts to a real customer's feed, and the
  blast radius of a cross-tenant mistake is another business's account.
- **Nobody runs `supabase db push`.** Production's recorded migration count
  drifts behind its file count and a push re-runs applied migrations. Ref
  `rloztdhzfliyvpvxsgjl`, and **there is no staging.** Write the migration
  freely; applying it to production is a deliberate act from `wt-core`.
- **No `DROP`, `TRUNCATE`, or `DELETE`/`UPDATE` without a `WHERE`** against any
  table holding real data.
- **Nobody force-pushes a shared branch.** A rebase over someone else's work
  loses it silently.
- **The three standing non-negotiables** hold everywhere: RLS on every table ·
  the ledger never lies (append-only, compensating entries, run
  `ledger-invariants.mjs` before and after) · **no invented numbers** — never
  render a figure no query produced.
- **One body AND one format per channel.** Any change that collapses per-channel
  variants into a single body is a regression, whatever it looks like.

**A `[contract]` change deserves a shout, not an approval.** If you change
`packages/shared`, a price, a migration or anything another lane consumes, you
may do it — but say so loudly in your handoff, because whoever merges needs to
know. Lanes broke each other four times exactly this way: `adapterFor` gained a
required third parameter, `decideAttach` a fourth, `violation-copy` changed
app-wide, `BrainRead` gained a required field. **A required field breaks
constructors, not readers** — say which.

---

## Who does what

Everyone has full access. These are focuses, not fences.

**Girija — design · `/lead-design`.** UI and UX against
**`docs/37_Design_System_v5.md`**, which is canon. Three other documents claim
authority over design and one still says in its own header that it *"wins for
any token or component value."* It does not:

```
docs/37_Design_System_v5.md    CANON — build from this
  supersedes docs/26_Design_System_v4.md      ("Do not build from this file.")
    supersedes docs/08_Design_System_SAHODA_LABS.md   (still claims to win)
    supersedes docs/ui-package/sahoda-labs/
docs/design2.0/UI_RULES_v3.md  superseded — points back at 08 "for governance"
```

Read `docs/45_Product_Structure.md` before designing any screen. Its most
important section is **what this product may not show.**

**Jiban — research · `/lead-research`.** Researches and builds anything.

**Divas — advisor · `/advisor`.** Proves `wt-core` and promotes it. Also works
a lane like anyone else.

---

## The shared account

All three sign in as one Claude account and push as one GitHub account. So:

- **Every commit is `SAHODALABS`** and must stay that way — Vercel blocks a
  deployment authored otherwise, and a lane's *preview* is gated on that lane's
  own HEAD. Author per-person and you lose your preview URL.
- **Two sessions can land on the same branch** with no warning until the second
  push is rejected. One person per lane at a time.
- **The usage quota is shared.** A wide `Workflow` fan-out eats what the others
  have.
- **Sessions, history and the artifact gallery are visible account-wide.**

---

## Pull before anything else

```bash
git fetch --all --prune
git pull --ff-only origin "$(git branch --show-current)"
```

Lanes move independently; a stale checkout writes against code that no longer
exists. `--ff-only` on purpose: a refusal means you diverged, which is a thing
to look at rather than merge past.

---

## Handoffs

`/handoff` writes `docs/workflow/handoffs/<name>-<date>.md` and commits it.
`/kickoff` reads your own to resume, then the others' to learn what moved.

**Name your branch in it.** With harness-assigned names and one shared git
author, the handoff is the only thing that says whose work this is.

Two sections carry the value and both are easy to skip: **every shared surface
touched**, and **every guard written with the mutation that proved it.**

**If it is not in git, it did not happen.**
