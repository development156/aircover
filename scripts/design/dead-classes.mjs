#!/usr/bin/env node
/**
 * Classes the source asks for that Tailwind never generated.
 *
 * ── WHY THIS IS NOT A LINT RULE ──────────────────────────────────────────────
 * The lint leg runs BEFORE the build, and the only trustworthy answer to "does
 * this utility exist" is the compiled CSS. `design-lint.mjs` rule 4 catches the
 * one case that can be decided statically — a breakpoint variant, because the
 * breakpoint names are declared in globals.css. It cannot catch an unknown
 * UTILITY NAME, and that is the half that has bitten twice.
 *
 * ── THE FAILURE MODE ─────────────────────────────────────────────────────────
 * Tailwind does not error on a class it does not recognise. It emits nothing.
 * The class stays in the markup, spelled plausibly, type-checking cleanly and
 * reading correctly in review, and the element simply keeps whatever it had.
 *
 * Two live defects found this way on 2026-08-20, both invisible to every other
 * check in the repo:
 *
 *   `sm:w-auto`        globals.css does `--breakpoint-*: initial` and defines
 *                      only narrow/wide, so `Start checkout` — a brand-filled
 *                      button on the money screen — was `w-full` at every width
 *                      and rendered ~1000px wide at 1440.
 *
 *   `bg-black/40`      globals.css also does `--color-*: initial` and only
 *                      redefines `--color-white`. So `backdrop:bg-black/40` on
 *                      Modal AND Drawer was never generated and EVERY overlay
 *                      in the product opened over an undimmed page.
 *
 * ── HOW TO RUN ───────────────────────────────────────────────────────────────
 *   pnpm --filter @sahoda/web build      # or leave a dev server running
 *   node scripts/design/dead-classes.mjs
 *
 * It reports candidates, not verdicts. Prose inside comments trips the class
 * pattern — "divide-by-zero", "text-only" — so read the list rather than
 * treating it as a gate. That is exactly why it is a report and not a leg.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('../..', import.meta.url).pathname
const SRC = join(ROOT, 'apps/web/src')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.tsx$/.test(entry)) out.push(full)
  }
  return out
}

/** Every compiled stylesheet we can find, dev or production. */
function compiledCss() {
  const roots = [join(ROOT, 'apps/web/.next')]
  const found = []
  for (const r of roots) {
    let stack = [r]
    while (stack.length) {
      const d = stack.pop()
      let entries
      try {
        entries = readdirSync(d)
      } catch {
        continue
      }
      for (const e of entries) {
        const full = join(d, e)
        let st
        try {
          st = statSync(full)
        } catch {
          continue
        }
        if (st.isDirectory()) stack.push(full)
        else if (e.endsWith('.css')) found.push(full)
      }
    }
  }
  return found
}

const css = compiledCss()
if (css.length === 0) {
  console.error('  no compiled CSS found under apps/web/.next — build or start the dev server first')
  process.exit(2)
}
const haystack = css.map((f) => readFileSync(f, 'utf8')).join('\n')

const PREFIX =
  '(?:bg|text|border|ring|fill|stroke|from|to|via|outline|decoration|shadow|accent|caret|divide)'
const CLASS = new RegExp(`(?<![\\w-])${PREFIX}-(?!\\[)[a-z][a-z0-9-]*`, 'g')

const used = new Map()
for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8')
  for (const m of src.matchAll(CLASS)) {
    if (!used.has(m[0])) used.set(m[0], file.slice(SRC.length + 1))
  }
}

const missing = [...used.entries()].filter(([u]) => !haystack.includes(u))
console.log(`  ${used.size} colour-ish utilities used · ${css.length} stylesheet(s) scanned\n`)
if (missing.length === 0) {
  console.log('  none missing from the compiled CSS')
} else {
  console.log('  NOT FOUND in compiled CSS (read these — prose in comments trips the pattern):')
  for (const [u, where] of missing) console.log(`    ${u.padEnd(24)} first seen in ${where}`)
}
