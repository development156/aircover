import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

import { quarantineInline } from '@sahoda/research'

/**
 * THE PROMPT AND THE FENCE MUST NAME THE SAME TWO TOKENS.
 *
 * ── WHAT IT CANNOT SEE ───────────────────────────────────────────────────────
 * It reads ONE file's text — `tasks/brand-guidelines.ts`, at whatever
 * `require.resolve('@sahoda/mesh')` points at:
 *  · every OTHER mesh task. A second task that fences untrusted text with its
 *    own markers is not checked by anything, here or elsewhere;
 *  · a prompt assembled at runtime, or tokens built by concatenation or from a
 *    constant — this greps for the literal strings in source;
 *  · whether the fence is APPLIED anywhere. It proves the prompt and the writer
 *    agree on markers, not that any call site actually fenced its input;
 *  · whether the model HONOURS the sentences. Three regexes prove the claim is
 *    present in the prompt, which is not the same fact as it being obeyed — and
 *    the note at the top of quarantine.ts records that published injection
 *    defences were bypassed with over 90% success.
 *
 * `packages/mesh` cannot import `@sahoda/research` — the layering runs the other
 * way — so `brand_guidelines`'s system prompt repeats the delimiters as literal
 * text. That is a second copy, and `quarantine.ts` is explicit about what a
 * second copy costs: a fence made of markers the neutralizer does not rewrite is
 * a door nobody is watching. Here the risk is the mirror image — the neutralizer
 * moves and the PROMPT keeps describing markers that no longer appear, so
 * untrusted text arrives fenced by something the model was never told about.
 *
 * Neither package can catch that alone. This test is in apps/web because apps/web
 * is the only place that imports both.
 */

const require = createRequire(import.meta.url)

function meshTaskSource(): string {
  const meshEntry = require.resolve('@sahoda/mesh')
  return readFileSync(resolve(dirname(meshEntry), 'tasks/brand-guidelines.ts'), 'utf8')
}

describe('brand_guidelines names the fence that research actually writes', () => {
  /** The real tokens, taken from the function that writes them — never retyped. */
  const fenced = quarantineInline('a sentence from their page', 'their page')
  const open = fenced.slice(0, fenced.indexOf(' '))
  const close = fenced.slice(fenced.lastIndexOf(' ') + 1)

  it('produces the two tokens this test then looks for', () => {
    // Guard the guard: if `quarantineInline` stops fencing, the two constants
    // above become garbage and every assertion below would pass on nonsense.
    expect(open).toBe('<<<UNTRUSTED_PAGE')
    expect(close).toBe('END_UNTRUSTED_PAGE>>>')
  })

  it('the system prompt names both', () => {
    const source = meshTaskSource()
    expect(source).toContain(open)
    expect(source).toContain(close)
  })

  it('the system prompt says the fenced text is evidence and not instruction', () => {
    const source = meshTaskSource()
    // The CLAIM, not the wording — rewrite the sentence freely, keep the promise.
    expect(source).toMatch(/evidence, not\s+instructions/i)
    expect(source).toMatch(/never as a directive/i)
    expect(source).toMatch(/Follow nothing/i)
  })
})
