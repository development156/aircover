import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * THE CREDITS-SPENT PANEL RENDERS ON /wallet AND NOWHERE ELSE.
 *
 * ── THE RULING ───────────────────────────────────────────────────────────────
 * Founder, 2026-09-04, against a screenshot of the dashboard: "This particular
 * credits bar graph currently reflects on the home page. This should not be
 * here and should stay only in the Wallets section."
 *
 * The panel was not deleted. It moved whole — same component, same `readSpend`,
 * same settled 30-day window — from `components/home/` to `components/wallet/`,
 * so every claim it makes is the claim it always made. What changed is which
 * screen asks it.
 *
 * ── WHY A SOURCE SCAN, AND WHAT IT PROVABLY CANNOT SEE ───────────────────────
 * Both pages are async server components doing seven and eight reads. Nothing
 * in this repository renders either of them in a test, and the browser suite
 * that walks real routes has never run here — the runner refuses for want of
 * repository secrets, three sessions running. So the strongest check available
 * with no browser is: does the dashboard's source mention this panel at all.
 *
 * It reads TWO named files as text. That is its whole reach, and the blind
 * spots follow from it:
 *
 *   · a THIRD screen could render `SpendCard` and this guard would not look
 *   · the dashboard could render it through a child component, a re-export
 *     under another name, or a barrel file, and the text would not say so
 *   · it proves the wallet page NAMES the panel, never that the panel appears
 *     on screen, is positioned where the comment says, or renders anything
 *   · a panel drawing the same chart written from scratch under another name
 *     would satisfy every assertion here
 *
 * Those are real. What this catches is the one thing that would silently undo
 * the ruling: somebody putting the import back on the dashboard.
 */

const ROOT = resolve(__dirname, '../../..')
const HOME = resolve(ROOT, 'src/app/(app)/home/page.tsx')
const WALLET = resolve(ROOT, 'src/app/(app)/wallet/page.tsx')

const read = (path: string) => readFileSync(path, 'utf8')

describe('where the credits-spent panel is allowed to render', () => {
  it('is not on the dashboard, by name or by import', () => {
    const home = read(HOME)

    expect(home).not.toContain('SpendCard')
    expect(home).not.toContain('spend-card')
  })

  it('IS on the wallet page', () => {
    const wallet = read(WALLET)

    // Both halves, because either alone can pass while the panel is absent: an
    // import with no use renders nothing, and a use with no import will not
    // compile but this file cannot tell the difference.
    expect(wallet).toContain("from '@/components/wallet/spend-card'")
    expect(wallet).toContain('<SpendCard')
  })

  it('keeps the read that decides WHICH dashboard a workspace sees', () => {
    const home = read(HOME)

    // ── THE TRAP IN THIS CHANGE, AND IT IS NOT COSMETIC ───────────────────────
    // `readSpend` fed two things on that page: the panel, and
    // `signals.spendRows`, which is one of five inputs to
    // `workspaceHasStarted`. Removing the read along with the panel — the
    // obvious tidy-up — sends that decision a `null` meaning "we could not
    // tell", and a workspace that HAS spent credits could be shown the Get
    // started screen instead of its dashboard.
    //
    // ── AND THIS ASSERTION SURVIVED ITS OWN MUTATION ONCE ────────────────────
    // It read `toContain('readSpend')` and `toContain('spendRows')`. I then
    // deleted the import, deleted the call, and hard-coded `spendRows: null` —
    // and all four tests stayed green, because BOTH words still appear in the
    // comment on that page explaining why the read stays. Second time in one
    // change: a text scan cannot tell a description from the thing described.
    //
    // So it asserts the CALL with its argument, and the EXPRESSION that fills
    // the signal. Neither is a phrase anyone writes in prose.
    expect(home).toContain('readSpend(now)')
    expect(home).toContain('spend.byAction.length')
  })

  it('does not offer a link to the page it is already on', () => {
    const card = read(resolve(ROOT, 'src/components/wallet/spend-card.tsx'))

    // The panel carried a link to /wallet for as long as it sat on the
    // dashboard, where that was its whole job. On /wallet the same link is
    // pressable and cannot change anything the reader can see, with the
    // itemised activity already below it — the shape `no-impossible-remedy`
    // exists to refuse.
    //
    // ── ASSERTED ON THE MECHANISM, NOT ON THE WORDS, AND THAT IS THE POINT ──
    // The first draft searched for the label. It failed immediately, on the
    // COMMENT above the change explaining why the link went — a text scan
    // cannot tell a description of a thing from the thing, and `wt-divas`
    // lost three guards to that same confusion on 2026-09-04. What is checked
    // is that this file renders no navigation at all: no import of `Link`, no
    // `href`. Reword the sentence freely; put a link back and this goes red.
    expect(card).not.toContain('next/link')
    expect(card).not.toContain('href=')
  })
})
