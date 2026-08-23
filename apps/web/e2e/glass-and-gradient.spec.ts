import { expect, test } from './fixtures/seeded-user'

/**
 * TWO RULES docs/37 STATES AS ENFORCED, MADE ENFORCED.
 *
 * §19 claims every guard has been shown red on the defect it exists for. That
 * was not true of two rules, and a spec table promising enforcement that does
 * not exist is worse than an empty cell — it is read as evidence.
 *
 *   §7  glass on chrome, opaque on data
 *   §8  the gradient must never compete with content
 *
 * `glass-cost.spec.ts` measures a frame-time BUDGET, which is a proxy: one blur
 * on one card would sail through it. And §8 turns "never competes" into a
 * number (under one deliberate ladder step against --canvas) that nothing read.
 *
 * Both are only knowable in a browser: one needs the composited pixel behind a
 * fixed layer, the other needs the resolved computed style of live elements.
 */

/* ── §7 · GLASS ON CHROME, OPAQUE ON DATA ─────────────────────────────────────
   THE RULE IS STRUCTURAL, so the check is structural.

   The first version of this guard listed data surfaces by selector —
   `[class*="rounded-lg"]`, `table`, the certainty classes. It fired on the
   command-palette TRIGGER, a rounded control that lives in the topbar. That is
   chrome, carries no value and is not what the rule is about: the guard was
   over-broad, not the design. Selecting "data" by class is guessing.

   What actually separates the two is where they render. Every chrome surface
   the rule allows — topbar, rail, mobile bottom bar, command palette, modals,
   drawers, toasts — is OUTSIDE `#main`. Everything that carries a value, a
   status or a certainty mark is INSIDE it. So the rule is one sentence:

       no blurred element inside #main, ever.

   Plus the specific mechanism §7 cites: a certainty mark may never sit on a
   blur, wherever it is, unless an opaque well stands between them. */
const CERTAINTY = '.is-real, .is-committed, .is-proposed, .is-simulated'

test.describe('the surface rules docs/37 states', () => {
  test('glass is on chrome only, and never on anything carrying a value', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    test.setTimeout(120_000)
    await page.goto('/home')
    await page.waitForLoadState('networkidle')

    const found = await page.evaluate((certaintySel: string) => {
      const blurred = (el: Element) => {
        const f = getComputedStyle(el).backdropFilter
        return Boolean(f) && f !== 'none'
      }
      const describe = (el: Element) =>
        `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className).slice(0, 50)}`

      const chrome = Array.from(document.querySelectorAll('*')).filter(blurred).map(describe)

      const illegal: string[] = []

      // 1 · Nothing inside the content region may be blurred.
      const main = document.querySelector('#main')
      if (main) {
        for (const el of Array.from(main.querySelectorAll('*'))) {
          if (blurred(el)) illegal.push(`blur inside #main: ${describe(el)}`)
        }
        if (blurred(main)) illegal.push(`#main itself is blurred`)
      }

      // 2 · A certainty mark may never rest on a blur without an opaque well.
      for (const el of Array.from(document.querySelectorAll(certaintySel))) {
        let node: Element | null = el.parentElement
        let shielded = false
        while (node) {
          const cs = getComputedStyle(node)
          if (cs.backdropFilter === 'none' && cs.backgroundColor.endsWith(', 1)')) shielded = true
          if (blurred(node)) {
            if (!shielded)
              illegal.push(`certainty mark ${describe(el)} on blurred ${describe(node)}`)
            break
          }
          node = node.parentElement
        }
      }
      return { chrome, illegal, hasMain: Boolean(main) }
    }, CERTAINTY)

    console.log(`\n──── GLASS PLACEMENT · /home ────`)
    console.log(`  blurred surfaces (${found.chrome.length}): ${found.chrome.join(', ') || '—'}`)

    // The rule is not "no glass" — it is "glass on chrome". Zero would mean the
    // topbar lost its treatment, which is also a regression worth catching.
    // And a page with no #main would make check 1 vacuous, and a page with no glass
    // would make the whole spec vacuous. Both are asserted, so this guard cannot
    // report green having examined nothing.
    expect(found.hasMain, '#main is missing — the inside/outside rule is vacuous').toBe(true)
    expect(found.chrome.length, 'the shell should carry its glass chrome').toBeGreaterThan(0)
    expect(
      found.illegal,
      'docs/37 §7 — glass on chrome, opaque on data. A translucent ground changes the fill ' +
        'weight of everything on it, and fill weight is what the Certainty System separates by.',
    ).toEqual([])
  })

  /* ── §8 · THE GRADIENT MUST NOT COMPETE ────────────────────────────────────
     "If you can read it as decorative from six feet away it is too strong" is
     turned into a number: the gradient's strongest point must sit closer to
     --canvas than ONE deliberate ladder step. canvas→surface is 1.04:1 in
     light, so a wash at or under 1.03:1 can never be mistaken for a surface
     edge. Sampled from the COMPOSITED layer, because what matters is what lands
     on the eye rather than what the token declares. */
  for (const theme of ['light', 'dark'] as const) {
    test(`the gradient ground stays under one ladder step — ${theme}`, async ({
      page,
      signedIn,
    }) => {
      void signedIn
      test.setTimeout(120_000)
      await page.addInitScript((t) => {
        try {
          window.localStorage.setItem('sahoda-theme', t as string)
        } catch {
          /* best effort */
        }
      }, theme)
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      const probe = await page.evaluate(() => {
        const layer = document.querySelector('.grad-ground') as HTMLElement | null
        if (!layer) return { missing: true as const }
        const cs = getComputedStyle(layer)
        const canvas = getComputedStyle(document.documentElement)
          .getPropertyValue('--canvas')
          .trim()
        return {
          missing: false as const,
          canvas,
          image: cs.backgroundImage,
          base: cs.backgroundColor,
          // The stops, as declared. Each is the token's own rgba().
          stops: ['--grad-1', '--grad-2', '--grad-3'].map((n) =>
            getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
          ),
        }
      })

      expect(probe.missing, 'the gradient layer is not on the page at all').toBe(false)
      if (probe.missing) return

      /* Composite each stop over --canvas at its own alpha and measure the
         contrast of the result against bare --canvas. That is the strongest
         the wash can ever read, because the stops fade to transparent. */
      const measured = await page.evaluate(
        ({ canvas, stops }: { canvas: string; stops: string[] }) => {
          const hex = (h: string) => {
            const c = h.replace('#', '')
            const f =
              c.length === 3
                ? c
                    .split('')
                    .map((x) => x + x)
                    .join('')
                : c
            return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16))
          }
          const lin = (c: number) => {
            const s = c / 255
            return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
          }
          const lum = (rgb: number[]) =>
            0.2126 * lin(rgb[0]!) + 0.7152 * lin(rgb[1]!) + 0.0722 * lin(rgb[2]!)
          const ratio = (a: number[], b: number[]) => {
            const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
            return (hi! + 0.05) / (lo! + 0.05)
          }
          const ground = hex(canvas)
          /* THE STOPS COME BACK AS 8-DIGIT HEX, NOT rgba().
             They are DECLARED `rgba(255, 102, 0, 0.05)` and the build emits
             `#ff66000d`. The first version of this parser matched /[\d.]+/ and
             got nothing usable, skipped every stop, and reported a passing
             "1:1" — a guard measuring nothing while looking green, which is the
             exact fault it exists to catch. Both spellings are read now, and a
             run that parses ZERO stops is a failure rather than a pass. */
          const parse = (s: string): number[] | null => {
            const t = s.trim()
            if (t.startsWith('#')) {
              const c = t.slice(1)
              if (c.length !== 8) return null
              const [r, g, b, a] = [0, 2, 4, 6].map((i) => parseInt(c.slice(i, i + 2), 16))
              return [r!, g!, b!, a! / 255]
            }
            const n = t.match(/[\d.]+/g)?.map(Number) ?? []
            return n.length >= 4 ? [n[0]!, n[1]!, n[2]!, n[3]!] : null
          }
          let max = 1
          let parsed = 0
          for (const s of stops) {
            const n = parse(s)
            if (!n) continue
            parsed++
            const a = n[3]!
            const over = [0, 1, 2].map((i) => n[i]! * a + ground[i]! * (1 - a))
            max = Math.max(max, ratio(over, ground))
          }
          return { worst: Math.round(max * 1000) / 1000, parsed }
        },
        { canvas: probe.canvas, stops: probe.stops },
      )
      const worst = measured.worst

      console.log(`\n──── GRADIENT · ${theme} ────`)
      console.log(`  --canvas ${probe.canvas}  stops ${probe.stops.join(' | ')}`)
      console.log(
        `  strongest stop composited vs --canvas: ${worst}:1  (ceiling 1.03:1) · ${measured.parsed}/3 stops parsed`,
      )
      expect(
        measured.parsed,
        'no gradient stop could be parsed — this guard would report a passing 1:1 having ' +
          'measured nothing, which is the fault it exists to catch',
      ).toBe(3)

      expect(
        worst,
        `docs/37 §8 — the gradient's strongest point measures ${worst}:1 against --canvas. ` +
          `Over 1.03:1 it can be mistaken for a surface edge, because canvas→surface is ` +
          `only 1.04:1. It must never compete with content.`,
      ).toBeLessThanOrEqual(1.03)
    })
  }
})
