import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A COMPONENT THAT CAN RENDER TWICE MUST NOT HARD-CODE AN `id`.
 *
 * ── THE DEFECT, MEASURED 2026-08-22 ─────────────────────────────────────────
 * `AddDocument` renders twice on the empty library — once in the page header and
 * once inside the `EmptyState` — which is deliberate: a control that reports an
 * outcome has to outlive the state change it causes, and `assets/page.tsx`
 * records the bug that taught it.
 *
 * Its form fields used literal ids (`knowledge-text-title`). Two elements with
 * the same `id` in one document is invalid HTML, and the practical consequence
 * is not cosmetic: `<label for>` resolves to the FIRST match, so every label in
 * the second dialog pointed at a control inside the first. Clicking a label
 * focused a field in a different, closed dialog, and a screen reader announced
 * the wrong association.
 *
 * Nothing caught it. It surfaced as a Playwright locator reporting "resolved to
 * 2 elements" — a test confused by a real defect rather than a flaky selector.
 *
 * ── WHY THIS READS THE SOURCE ───────────────────────────────────────────────
 * Rendering the component twice and diffing the ids would be the stronger test
 * and needs jsdom, a Clerk provider and a router. The property is a property of
 * the SOURCE — a literal id in a component that can appear twice is wrong
 * whatever it renders to — so the source is what is checked, and it runs in a
 * millisecond on every gate.
 */
const SOURCE = readFileSync(resolve(import.meta.dirname, 'add-document.tsx'), 'utf8')

describe('AddDocument can safely render twice', () => {
  it('hard-codes no id or htmlFor', () => {
    // `id="…"` / `htmlFor="…"` with a string literal. A template literal is what
    // a `useId()`-derived value looks like and is what this asks for instead.
    const literals = [...SOURCE.matchAll(/\b(?:id|htmlFor)="([^"]+)"/g)].map((m) => m[1])
    expect(
      literals,
      'These become duplicate ids when the component renders twice, and <label for> then points into the other copy.',
    ).toEqual([])
  })

  it('derives its ids from useId', () => {
    // Guard the guard: an assertion that only forbids something passes trivially
    // if the ids were deleted rather than fixed.
    expect(SOURCE).toContain('useId()')
    expect(SOURCE.match(/htmlFor=\{`\$\{ids\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
    expect(SOURCE.match(/id=\{`\$\{ids\}/g)?.length ?? 0).toBeGreaterThanOrEqual(4)
  })
})
