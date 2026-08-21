#!/usr/bin/env node
/**
 * Read the capture manifest and print what MEASUREMENT can see.
 *
 * This is deliberately not the report. Measurement cannot see a missing orb, a
 * 2x2 canvas stretched over 480px, or a screen whose largest element carries the
 * least information — every one of those has to be found by opening the frame.
 * What this does is point at the frames most likely to be worth opening, and
 * carry the numbers a prose finding has to cite.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const raw = readFileSync(join(ROOT, '.ux', 'manifest.jsonl'), 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l))

/**
 * One row per FILE, last write wins.
 *
 * An aborted capture run re-shot part of the j3 sweep before it was stopped, so
 * the same frame has two rows. Counting both would report 240 screens where 40
 * exist, and the second row is the one whose measurements match the PNG now on
 * disk — so the later row is kept rather than the first.
 */
const byFile = new Map()
for (const r of raw) byFile.set(r.file, r)
const rows = [...byFile.values()]
if (rows.length !== raw.length) {
  console.log(`(deduped ${raw.length} manifest rows to ${rows.length} distinct frames)`)
}

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : fallback
}
const only = arg('journey', null)
const view = arg('view', 'summary')
const picked = only ? rows.filter((r) => r.journey === only) : rows

const n = (v) => (typeof v === 'number' ? v : 0)
const get = (r, k, f = 'count') => n(r.d?.[k]?.[f])

function line(...parts) {
  console.log(parts.join(' '))
}

if (view === 'summary' || view === 'all') {
  line(`\n=== ${picked.length} frames ===`)
  const themeBad = picked.filter((r) => r.theme !== r.domTheme)
  line(`theme mismatches (a frame labelled one thing and painted another): ${themeBad.length}`)
  for (const r of themeBad.slice(0, 8)) line(`   ${r.file} want=${r.theme} got=${r.domTheme}`)

  const dup = new Map()
  for (const r of picked) dup.set(r.sha, [...(dup.get(r.sha) ?? []), r])
  const identical = [...dup.values()].filter(
    (g) => g.length > 1 && new Set(g.map((x) => x.stop)).size > 1,
  )
  line(`\nidentical frames under DIFFERENT stop names: ${identical.length} groups`)
  for (const g of identical.slice(0, 10)) {
    line(`   ${g.map((x) => `${x.journey}/${x.stop}@${x.width}${x.theme[0]}`).join('  ==  ')}`)
  }

  const tiny = picked.filter((r) => r.bytes < 6000)
  line(`\nsuspiciously small frames (<6KB — a placeholder passes any size gate): ${tiny.length}`)
  for (const r of tiny.slice(0, 10)) line(`   ${r.file} ${r.bytes}B`)
}

if (view === 'defects' || view === 'all') {
  const rank = (key, field, label, min = 1) => {
    const hits = picked
      .map((r) => ({ r, v: get(r, key, field) }))
      .filter((x) => x.v >= min)
      .sort((a, b) => b.v - a.v)
    line(`\n--- ${label} (${hits.length} frames) ---`)
    for (const { r, v } of hits.slice(0, 25)) {
      line(`   ${String(v).padStart(4)}  ${r.journey}/${r.stop} @${r.width}/${r.theme}  ${r.route}`)
    }
  }
  rank('overflow', 'count', 'ELEMENTS PAINTED PAST THE VIEWPORT')
  rank('unnamed', 'count', 'INTERACTIVE ELEMENTS WITH NO ACCESSIBLE NAME')
  rank('invisibleText', 'count', 'TEXT AT UNDER 1.25:1 AGAINST ITS OWN GROUND')
  rank('arrowCursors', 'count', 'CLICKABLE THINGS WEARING AN ARROW CURSOR')
  rank('deadEnds', 'count', 'DISABLED CONTROLS (a dead end wearing an action’s clothes)')
  rank('brandFills', 'count', 'BRAND-ORANGE FILLS ON ONE SCREEN (§1.5 allows one primary)', 2)

  const wide = picked.filter((r) => n(r.d?.overflow?.docWidth) > n(r.d?.overflow?.viewport) + 1)
  line(`\n--- THE PAGE ITSELF SCROLLS SIDEWAYS (${wide.length} frames) ---`)
  for (const r of wide.slice(0, 25)) {
    line(
      `   ${r.d.overflow.docWidth}px in a ${r.d.overflow.viewport}px viewport   ${r.journey}/${r.stop} @${r.width}/${r.theme}`,
    )
  }

  const phone = picked.filter((r) => r.width <= 700)
  const touch = phone
    .map((r) => ({ r, v: get(r, 'touch') }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v)
  line(`\n--- TAP TARGETS UNDER 44px, AT PHONE WIDTHS ONLY (${touch.length} frames) ---`)
  for (const { r, v } of touch.slice(0, 20)) {
    line(`   ${String(v).padStart(3)}  ${r.journey}/${r.stop} @${r.width}/${r.theme}`)
  }

  const noH1 = picked.filter((r) => get(r, 'headings') === 0)
  line(`\n--- FRAMES WITH NO VISIBLE HEADING AT ALL (${noH1.length}) ---`)
  for (const r of noH1.slice(0, 20))
    line(`   ${r.journey}/${r.stop} @${r.width}/${r.theme} ${r.route}`)

  const slow = picked.filter((r) => n(r.ms) > 2000).sort((a, b) => n(b.ms) - n(a.ms))
  line(`\n--- SLOWEST NAVIGATIONS (${slow.length} over 2s) ---`)
  for (const r of slow.slice(0, 20))
    line(`   ${r.ms}ms  ${r.journey}/${r.stop} @${r.width}/${r.theme} ${r.route}`)
}

if (view === 'names') {
  const seen = new Map()
  for (const r of picked) {
    for (const it of r.d?.unnamed?.items ?? []) {
      const key = `${it.tag}|${it.role}|${it.href}|${it.cls}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  line(`\n--- DISTINCT UNNAMED ELEMENTS, BY HOW OFTEN THEY APPEAR ---`)
  for (const [k, v] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    line(`   ${String(v).padStart(4)}x  ${k}`)
  }
}

if (view === 'cursors') {
  const seen = new Map()
  for (const r of picked) {
    for (const it of r.d?.arrowCursors?.items ?? []) {
      const key = `${it.tag}|${it.cursor}|${it.text}`
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
  }
  line(`\n--- DISTINCT ARROW-CURSOR CONTROLS ---`)
  for (const [k, v] of [...seen.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
    line(`   ${String(v).padStart(4)}x  ${k}`)
  }
}

if (view === 'fills') {
  line(`\n--- WHAT IS PAINTED IN BRAND ORANGE, PER SCREEN ---`)
  for (const r of picked
    .filter((x) => get(x, 'brandFills') >= 2)
    .sort((a, b) => get(b, 'brandFills') - get(a, 'brandFills'))
    .slice(0, 30)) {
    line(`   ${r.journey}/${r.stop} @${r.width}/${r.theme}  n=${get(r, 'brandFills')}`)
    for (const it of r.d.brandFills.items) line(`        ${it.w}x${it.h}  ${it.tag}  "${it.text}"`)
  }
}

if (view === 'list') {
  for (const r of picked)
    line(`${r.file}\t${r.journey}\t${r.stop}\t${r.width}\t${r.theme}\t${r.route}`)
}
