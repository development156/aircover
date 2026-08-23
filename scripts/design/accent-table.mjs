#!/usr/bin/env node
/**
 * Print the accent-spend table for a capture run, and diff two runs.
 *
 * Reads `accent.jsonl` — one row per frame, written by `flow-frames.spec.ts`
 * through `e2e/helpers/accent.ts`, whose threshold is `docs/37` §2.3's
 * (HSV s > 0.30, v > 0.25, every second pixel in both axes).
 *
 *   node scripts/design/accent-table.mjs .flow-before
 *   node scripts/design/accent-table.mjs .flow-before .flow-after
 *
 * ── THE PERCENTAGE IS A FRACTION OF THE FRAME, AND FRAMES CHANGE HEIGHT ──────
 * These are FULL-PAGE captures, so a page that gets shorter scores a HIGHER
 * percentage for the same amount of orange, and a page that grows scores lower
 * while spending more. That is not a flaw in the measure — it is what "fraction
 * of the screen" means — but it makes the percentage alone a bad verdict on a
 * route whose height moved. So both columns are printed: the fraction, and the
 * absolute count of saturated samples. A real reduction moves BOTH down.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function load(dir) {
  const rows = readFileSync(join(dir, 'accent.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const byKey = new Map()
  for (const r of rows) byKey.set(`${r.stop}|${r.width}|${r.theme}`, r)
  return byKey
}

const [beforeDir, afterDir] = process.argv.slice(2)
if (!beforeDir) {
  console.error('usage: accent-table.mjs <before-dir> [after-dir]')
  process.exit(1)
}

const before = load(beforeDir)
const after = afterDir ? load(afterDir) : null

const pct = (n) => n.toFixed(3).padStart(7)
const int = (n) => String(n).padStart(7)

const keys = [...before.keys()].sort()

if (!after) {
  console.log(
    'stop'.padEnd(24),
    'w'.padStart(5),
    'theme'.padEnd(6),
    'accent%'.padStart(7),
    'satpx'.padStart(8),
  )
  for (const k of keys) {
    const r = before.get(k)
    console.log(
      r.stop.padEnd(24),
      String(r.width).padStart(5),
      r.theme.padEnd(6),
      pct(r.percent),
      int(r.saturated),
    )
  }
  const mean = [...before.values()].reduce((a, r) => a + r.percent, 0) / before.size
  console.log(`\n${before.size} frames · mean accent ${mean.toFixed(3)}%`)
} else {
  console.log(
    'stop'.padEnd(24),
    'w'.padStart(5),
    'theme'.padEnd(6),
    'before%'.padStart(7),
    'after%'.padStart(7),
    'delta'.padStart(8),
    'satpx→'.padStart(9),
    'satpx'.padStart(8),
  )
  let up = 0,
    down = 0,
    missing = 0
  for (const k of keys) {
    const b = before.get(k)
    const a = after.get(k)
    if (!a) {
      missing++
      console.log(
        b.stop.padEnd(24),
        String(b.width).padStart(5),
        b.theme.padEnd(6),
        pct(b.percent),
        '  ABSENT IN AFTER',
      )
      continue
    }
    const d = a.percent - b.percent
    if (d > 0.0005) up++
    else if (d < -0.0005) down++
    console.log(
      b.stop.padEnd(24),
      String(b.width).padStart(5),
      b.theme.padEnd(6),
      pct(b.percent),
      pct(a.percent),
      (d >= 0 ? '+' : '') + d.toFixed(3).padStart(7),
      int(b.saturated),
      int(a.saturated),
    )
  }
  const mb = [...before.values()].reduce((s, r) => s + r.percent, 0) / before.size
  const ma = [...after.values()].reduce((s, r) => s + r.percent, 0) / after.size
  console.log(
    `\nmean ${mb.toFixed(3)}% → ${ma.toFixed(3)}%   (${down} frames down, ${up} up, ${missing} absent)`,
  )
}
