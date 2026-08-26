import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * A page's own `metadata.title` may not repeat the suffix the root template adds.
 *
 * ── THE SCREEN THIS EXISTS BECAUSE OF ────────────────────────────────────────
 * `src/app/layout.tsx` declares `title: { default: 'Sahoda', template: '%s ·
 * Sahoda' }`. A page that sets its own title has the template applied to it, so
 * a page title already ending in `· Sahoda` renders TWICE:
 *
 *   /design-system  ->  "Design system · Sahoda · Sahoda"
 *
 * Measured 2026-08-24 in a real browser against a production `next start`, by
 * reading `page.title()`. It had been shipping that way; nothing looked at a tab.
 *
 * ── WHY A SCANNER AND NOT A PER-PAGE ASSERTION ───────────────────────────────
 * There was exactly ONE offender among 58 routes, so a test naming that page
 * would have gone green the moment it was fixed and never spoken again. The
 * defect is not "this page is wrong", it is "the template's contract is easy to
 * violate and invisible once shipped" — the next page to set a title is as
 * likely to add the suffix. So the guard is over every page, and it fails on the
 * NEXT one too.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * State the blind spots rather than implying coverage:
 *  · Only STATIC string titles. A `generateMetadata()` that computes a title at
 *    request time is not read here, and `/posts/[id]` uses one.
 *  · Only the literal suffix the root template appends today. The suffix is read
 *    out of `layout.tsx` rather than hard-coded here, so changing the template
 *    makes this fail loudly instead of silently checking a string the product no
 *    longer uses. Proved by mutation: `'%s | Sahoda Labs'` reds the first test.
 *  · A title assembled from a variable or a constant is not resolved.
 */

const APP = resolve(import.meta.dirname, '..', 'app')
const LAYOUT = resolve(APP, 'layout.tsx')

/** Read the suffix out of the root layout so this guard cannot drift away from it. */
function templateSuffix(): string {
  const source = readFileSync(LAYOUT, 'utf8')
  const match = source.match(/template:\s*'%s([^']*)'/)
  if (!match) {
    throw new Error(
      `Could not read the title template out of ${LAYOUT}. If the root layout no ` +
        `longer declares one, this guard is measuring nothing and must be updated ` +
        `or deleted deliberately.`,
    )
  }
  return match[1] ?? ''
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue
    const full = resolve(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/^page\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** The static `title: '…'` of a page's exported metadata, when it has one. */
function staticTitle(source: string): string | null {
  const match = source.match(/\btitle:\s*'([^']*)'/)
  return match?.[1] ?? null
}

describe('the root title template is applied exactly once', () => {
  const suffix = templateSuffix()
  const pages = walk(APP)

  it('finds the template and the pages, so a green result means something', () => {
    // Guard the guard: if either of these is empty the assertion below passes
    // vacuously, which is the failure mode this whole file is written against.
    expect(suffix).toBe(' · Sahoda')
    expect(pages.length).toBeGreaterThan(50)
  })

  it('no page repeats the suffix its template already adds', () => {
    const offenders = pages
      .map((file) => ({ file, title: staticTitle(readFileSync(file, 'utf8')) }))
      .filter((p) => p.title !== null && p.title.endsWith(suffix))
      .map((p) => `${p.file.replace(APP, 'src/app')} -> "${p.title}${suffix}"`)

    expect(
      offenders,
      `A page's own metadata.title must not end in "${suffix}" — layout.tsx ` +
        `appends it, so the tab renders it twice. Drop the suffix from the page.`,
    ).toEqual([])
  })
})
