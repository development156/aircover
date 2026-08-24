# 05 · Traps and verification

**This is the most expensive file in the folder.** Every entry cost a session, and several cost a day. None would be rediscovered cheaply.

---

# Part one · The verification doctrine

Nine rules. They generalise past this codebase.

## A guard never shown to fail is not a guard

Break the thing it tests. Watch it go red. If it does not go red, you have a comfort blanket.

Six guards in this project were found passing by *not looking*:

- `wiring.test.ts` skipped any entry preceded by a comment, leaving a **public payment webhook** unchecked for months
- `lint` exited 0 in nine packages — that gate leg could not fail
- `shell-probe.spec.ts` measured the 44px floor and **asserted nothing**, was skipped unless an env var was set, and carried no `@smoke` tag. Made to assert, it went red instantly on three live controls
- **Twenty-six billing integration tests had never once executed**, because `describe.skipIf` reports a suite that ran nothing as *passing*. One was a release gate that could not have passed against any database
- A brain guard tested `BRAIN_SECTIONS[0]` only
- A provenance guard passed a fabricated `3`, because its allow-list admitted any price from `pricing.config.json` — and those prices are 1, 2, 3, 5, 6, 12, 20, 25, 50, which is most of the small integers a fake figure would ever be

## Two guards on one hole look like one guard working

A session swapped its approval gate for a wrong condition and only 2 of 6 assertions went red — a separate price re-check was refusing the same rows. Mutate until you find the mutation that reproduces the *real* defect.

## An accidental TypeError impersonates a guard

Three of four refusal tests passed **with the guard deleted**, because `existing.some(…)` throws on null and the outer catch returns `ok:false`. Asserting `result.ok === false` proved nothing. **Assert the sentence.**

## A detector inherits the blind spot of the code it audits

A `connections.status` scanner understood only the PostgREST builder, so it found two bad call sites and **certified the third** — the cron, reaching the same table through raw SQL.

Another grepped `from '@sahoda/mesh'` with a *single quote*, so a double-quoted import, a dynamic `import()` or a `require` walks past. That is a spelling match — the exact defect its own lane had fixed in an IPv6 classifier one commit earlier.

**State what your detector cannot see.** A guard that certifies what it cannot parse is worse than no guard.

## A test that watches the half that cannot change reports green forever

`balance.test.ts` promised *in its own comment* to fail when a hold reaper shipped. One shipped a month earlier. It asserted the **copy** — and copy is exactly the half a shipping reaper does not move.

## Two artifacts holding half a fact each, with no test across the seam

The shape behind most defects found after the code first looked green.

`estimated_credits` written by TypeScript, `approved_credits` by SQL — nothing read both, so they drifted into different units while each half stayed internally correct. A cron's schedule in `vercel.json`, its Clerk exemption in `middleware.ts` — the heartbeat watched the half that fired and would have reported green forever.

**Coverage measured per-file says nothing about seams.** The tests that caught things deliberately read both sides.

## A token can be correct while the composition is wrong

Three instances. `--surface-2` **equalled** `--surface` exactly in dark: 117 of 120 frames had a fill separating nothing, and nothing could go red because a missing 4% fill reads as a design choice. `--pstrong` on `--p` measured **1.11:1** against a 4.5 requirement. The primary navigation measured **2.49:1** while every token check passed.

**Measure the resolved pair, never the declared value.** And note: guards that grade *tokens* cannot see what *components* write — `--pfg` was correct for weeks while three components wrote `text-white` on a brand fill.

## A count is not a verdict

A session reported 32 failures. Grouping by error message: **61 `ERR_CONNECTION_REFUSED`** from a dev server it had killed itself, and exactly **2** real assertion failures.

Another's 76 failures were one dead Turbopack server. Another's 20 were one cause — `waitForURL` timing out, never an assertion.

**Six unrelated tests failing at once is an environment. One test failing is a diff.**

## A wrong retraction is worse than no check

A session measured white-on-white at ratio 1.00 and retracted it as a measurement artifact. **It was real** — `--ink` inverts to `#fff`, so `dark:bg-white dark:text-ink` is the same colour twice, and six components carried a "fix" that resolved identically.

When you retract, **state what you MEASURED**, never what you inferred.

---

# Part two · Environment traps

## Never run `pnpm dev` for a measurement or a suite

Measured twice: 76 "failures" that were one dead Turbopack server, and 78 `ERR_CONNECTION_REFUSED` that became **zero** under `next start` on the same commit. Dev numbers differ by 2.5×, and races appear only on the fast path.

## Kill the server before deleting `.next`

`turbo build` and `next dev` share `apps/web/.next`. A dev server on production artefacts answers every page with a React Client Manifest error — 33 of 63 smoke failures, sub-2s, across unrelated specs, no OOM.

**And deleting `.next` under a live server is worse:** the process holds the deleted inodes, so one route answers 200 while seventeen unrelated specs die. It reads exactly like a broad code regression.

Order: `pkill` → `rm -rf .next` → build → start.

## The gate lies in four ways

`pnpm gate | tail -60` returns **tail's** exit code. Never pipe it.

`turbo build` sat **outside the gate for 27 runs** while a production build error survived, invisible to typecheck because the types resolve perfectly.

A turbo leg finishing in **under a second is a cache replay** and verified nothing.

Stage 5 leaves a production `.next` that stage 3 then runs against, so a second consecutive gate fails for a reason unrelated to the code.

## `md:` `sm:` `lg:` compile to nothing

`--breakpoint-*: initial` wiped them. **Tailwind emits no CSS and no warning.** Fifteen classes across thirteen files were permanently single-column.

The real breakpoints are **700 and 1180**. So 390 and 1440 both land in terminal bands and **neither exercises 700–1179** — capture 1024 too. A session found rows pushing a page to 464px at a 390 viewport only because it added that third width.

## Your harness is the most dangerous instrument

Playwright parks the pointer where you last clicked. One harness left it at (836, 406) — and `/posts` draws its primary button across that exact point at 1440. **Three capture runs hours apart photographed the product's primary action as solid black.** `getComputedStyle` said orange every time, and the session treated the DOM as the thing that was wrong.

**Move the pointer off-screen after every click.**

Other capture traps: a 520 ms transition plus a 360 ms child rise catches headings at 30% opacity. Full-page captures render `position:fixed` chrome at its scroll offset. Two mobile frames came out **byte-identical** and the only gate was "bigger than 3 KB" — **hash every frame; a size check is not an identity check.**

## Measurement cannot catch a missing thing

A session had **56 hashed, distinct, fully-passing frames** while the orb — the entire argument of that screen — was absent. Later, while a build screen stretched a 2×2 canvas over 480px.

A passing assertion tells you what you asked about. **A frame tells you what is there.** Look at every frame.

**And read them as contact sheets.** Pale-on-pale is invisible frame-by-frame and unmissable beside three siblings.

## Self-test every detector before trusting it

A truncation sweep produced **142 false positives** across two designs before it was trustworthy — `sr-only` text always reports `scrollWidth > clientWidth`, and the tell was every hit measuring exactly 2.2 lines.

A contrast detector reported eight invisible-text hits that were **its own clamping artefact** — the exact signature it hunts. Validate with white-on-white → 0 and black-on-white → 45 before believing a single result.

## The machine

`journalctl -k` **before** debugging any failure that looks impossible. `readlink /proc/<pid>/cwd` to confirm a dev server is yours. Never `pkill` by a pattern matching your own shell's command line. A background poller reports **its own loop exiting**, not the thing it watched — one nearly quoted a gate from three commits earlier.

## Database

Postgres infers **one type per parameter**, so `$6` cannot be both `timestamptz` and `::date`. You cannot insert into a **generated** column. PostgREST reports a missing table as `PGRST205` from its own schema cache, not `42P01` — and a missing *column* is `42703`, which is why one binding's missing-table branch never fired while every request 500'd.

PGlite creates roles but **not grants**: Supabase grants `authenticated` table privileges at project creation, before any migration runs, so on a bare box every read looks like an RLS denial rather than a missing GRANT.

## Security specifics

`JSON.stringify` escapes `"` and `\`, **not** `<` and `>`. A quarantine fence built from exactly those two characters was forgeable, because `extractTitle` decoded `&gt;` into them — the forgery existed only *after* parsing and was invisible in the served HTML.

`new URL('http://[::ffff:169.254.169.254]/').hostname` returns `[::ffff:a9fe:a9fe]`, so a dotted-quad regex **could never fire**. 14 of 16 hostile IPv6 forms walked through.

A 4xx on a broken read makes an outage look like a client error, and **every 5xx log filter misses it.**

A blind probe returns zero everywhere and looks perfect. **Always probe first as a real member** and require the token to *see* rows — and pick the member owning the most rows, because a member with none proves nothing.

`isPublicRoute` decides what Clerk **does**; `config.matcher` decides whether Clerk **runs**. A path in one but not the other ticks perfectly and is crashable.

## And one last one

`backdrop-filter` and `background-image` are **separate CSS properties**. Tokenising the shorthand meant one silently erased the other, and three routes returned 500 in production while passing every test — because every test asserted the *token value*, not the *resolved property*.
