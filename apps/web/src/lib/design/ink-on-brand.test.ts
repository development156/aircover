import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * INK ON ORANGE, NEVER WHITE ON ORANGE — AT EVERY CALL SITE.
 *
 * ── THE DEFECT THIS GENERALISES ──────────────────────────────────────────────
 * docs/26 §1.2 is unambiguous: `--pfg` is `#000000`, measured 7.15:1, and white
 * on `#ff6600` is 2.94:1 — the figure §1.1 names as missing every threshold
 * there is. `own-medicine.test.ts` already grades the TOKEN file against the
 * app's own Readability Guard, and the token has been correct for a while.
 *
 * That did not stop `badge.tsx` from shipping `urgent: 'bg-brand text-white'`.
 * The rule was in the doc, the right value was in the token, the guard was
 * pointed at the token — and a call site wrote the literal anyway. MEASURED on
 * the onboarding reveal: the badge reading "Weak signal — inputs conflict" was
 * the least readable thing on the screen where an owner decides whether to
 * approve a brain, while the Approve button 1500px below it wore the correct
 * pair. Two orange fills on one screen disagreeing with each other.
 *
 * So the guard has to look at the CLASS STRINGS, not at the tokens.
 *
 * ── WHY A SOURCE SCAN AND NOT A RENDER ───────────────────────────────────────
 * A rendered test can only catch the components someone thought to render. This
 * catches the pairing wherever it is written, including in a file added
 * tomorrow, and it costs no browser.
 *
 * It is deliberately narrow: only `text-white` on the SAME element as a brand
 * FILL. `bg-ink text-white` is correct and common (rung 2 of the badge ladder),
 * `dark:text-white` on a dark surface is correct, and a white glyph on a
 * photograph is not this rule's business.
 */

const HERE = fileURLToPath(new URL('.', import.meta.url))
const SRC = join(HERE, '..', '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      walk(path, out)
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/**
 * TWO RULES, because the defect arrives two ways and one check cannot see both.
 *
 * A — the RESTING pair. An unprefixed brand fill beside an unprefixed
 *     `text-white`. This is `badge.tsx`'s `urgent: 'bg-brand text-white'`.
 *
 * B — the STATE pair. A `hover:`/`focus:`/`active:` variant that changes the
 *     FILL to brand without changing the LABEL. `button.tsx`'s destructive
 *     variant did exactly this and only on light: it carried
 *     `dark:hover:text-primary-foreground` and no light counterpart, so
 *     hovering Delete on light painted the base `text-white` over `#ff6600`.
 *     The asymmetry was the tell, and rule A alone cannot see it.
 *
 * The distinction that makes both precise is PREFIXES. A brand fill behind a
 * state prefix is not the resting fill, so rule A must ignore it — an earlier
 * version did not, and reported the destructive variant as broken after it had
 * been fixed. That is the same "detector reports its own artefact" failure this
 * whole lane exists to avoid, arriving one level up.
 */
const BRAND_FILL_BARE = /^bg-(?:brand|primary)$/
const STATE_BRAND_FILL = /^([a-z-]+):bg-(?:brand|primary)$/

function judge(list: string): boolean {
  const classes = list.split(/\s+/).filter(Boolean)
  const restingFillIsBrand = classes.some((c) => BRAND_FILL_BARE.test(c))
  const restingTextIsWhite = classes.includes('text-white')

  // A.
  if (restingFillIsBrand && restingTextIsWhite) return true

  // B. Every state that repaints the fill brand must repaint the label too.
  for (const c of classes) {
    const match = STATE_BRAND_FILL.exec(c)
    if (!match) continue
    const state = match[1]
    const repaintsLabel = classes.some((other) => other.startsWith(`${state}:text-`))
    if (!repaintsLabel && restingTextIsWhite) return true
  }
  return false
}

function offendingClassLists(source: string): string[] {
  const hits: string[] = []
  const push = (list: string) => {
    if (judge(list)) hits.push(list.trim().slice(0, 140))
  }
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\}|'([^']*)')/g)) {
    push(match[1] ?? match[2] ?? match[3] ?? '')
  }
  // The variant tables (cva, Record<Rung, string>) are plain strings, not
  // className attributes, and badge.tsx's defect lived in exactly one of those.
  for (const match of source.matchAll(
    /(?:'|")([^'"\n]*\bbg-(?:brand|primary)\b[^'"\n]*)(?:'|")/g,
  )) {
    push(match[1] ?? '')
  }
  // A `className="..."` attribute is matched by BOTH scanners, so the same
  // string arrives twice.
  return [...new Set(hits)]
}

describe('nothing paints white text on a brand fill', () => {
  it('the detector recognises the exact defect that shipped', () => {
    // Calibration first, both ends. Without this the scan below could stop
    // detecting and report green for ever.
    // Rule A, the resting pair — badge.tsx's actual defect.
    expect(offendingClassLists(`const x = 'bg-brand text-white'`)).toHaveLength(1)
    expect(offendingClassLists(`<div className="bg-primary text-white" />`)).toHaveLength(1)
    // Rule B, the state pair — button.tsx's destructive hover, on light only.
    expect(offendingClassLists(`const x = 'bg-ink text-white hover:bg-primary'`)).toHaveLength(1)
    // And the shapes it must NOT flag.
    expect(offendingClassLists(`const x = 'bg-ink text-white'`)).toHaveLength(0)
    expect(offendingClassLists(`const x = 'bg-brand text-primary-foreground'`)).toHaveLength(0)
    expect(offendingClassLists(`<div className="bg-brand hover:text-white" />`)).toHaveLength(0)
    // The FIXED destructive variant: the hover repaints fill AND label.
    expect(
      offendingClassLists(
        `const x = 'bg-ink text-white hover:bg-primary hover:text-primary-foreground'`,
      ),
    ).toHaveLength(0)
  })

  it('no source file in apps/web pairs a brand fill with white text', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const hits = offendingClassLists(readFileSync(file, 'utf8'))
      for (const hit of hits) offenders.push(`${file.slice(SRC.length + 1)}  ${hit}`)
    }
    // The message carries no hex literal on purpose: design-lint scans quoted
    // strings in src for raw colours and does not exempt a test's own prose.
    // The numbers live in the comment above, where the rule cannot mistake an
    // explanation for a style.
    expect(
      offenders,
      'White text on the brand fill measures 2.94:1 (docs/26 §1.1-1.2). Use ' +
        'text-primary-foreground, which is ink and measures 7.15:1 in both themes.\n' +
        offenders.join('\n'),
    ).toEqual([])
  })
})
