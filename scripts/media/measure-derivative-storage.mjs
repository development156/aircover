/**
 * HOW MUCH STORAGE CROPPED COPIES ACTUALLY COST.
 *
 * Run from apps/web (it resolves `sharp` from there):  node ../../scripts/media/measure-derivative-storage.mjs
 *
 * ── WHAT IS REAL HERE AND WHAT IS NOT ──────────────────────────────────────
 * The GEOMETRY is exact: which channel selections force a crop, and how many
 * pixels survive, is computed from the declared bands and is content-
 * independent. The BYTES are measured on synthetic photographic content —
 * gradients plus edges plus fine detail — because the only real corpus is the
 * production storage bucket and this worktree cannot reach it. Pure noise would
 * overstate every JPEG and a flat fill would understate every one; this sits
 * between them, which is where a photograph sits.
 *
 * The real files in the repo are brand PNGs. They are included because they are
 * REAL, and they are labelled as illustrations because that is what they are —
 * a lossless PNG re-encoded as PNG barely shrinks, which is the worst case and
 * the one worth seeing.
 */
import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// The declared bands, restated ONLY here so the script is standalone; they are
// asserted against CONSTRAINTS by targets.test.ts.
const BANDS = { instagram: [0.75, 1.91] }
const CAP = { x: 5, gbp: 5, linkedin: 5, instagram: 8 }

function fit(w, h, lo, hi) {
  const a = w / h
  if (!(a < lo || a > hi)) return { w, h }
  const ideal = Math.min(Math.max(a, lo), hi)
  let best = null
  for (let d = -3; d <= 3; d++) {
    for (const c of [
      { w: Math.round(h * ideal) + d, h },
      { w, h: Math.round(w / ideal) + d },
    ]) {
      if (c.w < 1 || c.h < 1 || c.w > w || c.h > h) continue
      const r = c.w / c.h
      if (r < lo || r > hi) continue
      if (!best || c.w * c.h > best.w * best.h) best = c
    }
  }
  return best
}

function band(channels) {
  let lo = 0,
    hi = Infinity
  for (const c of channels) {
    const b = BANDS[c]
    if (b) {
      lo = Math.max(lo, b[0])
      hi = Math.min(hi, b[1])
    }
  }
  return [lo, hi]
}

const SETS = [
  ['instagram'],
  ['instagram', 'x'],
  ['instagram', 'linkedin', 'gbp'],
  ['x', 'linkedin', 'gbp'],
]

/** Photograph-like content: smooth gradients plus edges and detail. Pure noise
 *  would overstate every JPEG; a flat fill would understate every one. */
async function photoLike(w, h, seed) {
  const px = Buffer.alloc(w * h * 3)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3
      const g = Math.sin((x / w) * 6 + seed) * 60 + Math.cos((y / h) * 4 + seed) * 50 + 128
      const detail = ((x * 7 + y * 13 + seed * 31) % 17) - 8
      const edge = x % 137 < 3 || y % 191 < 3 ? 70 : 0
      px[i] = Math.max(0, Math.min(255, g + detail + edge))
      px[i + 1] = Math.max(0, Math.min(255, g * 0.8 + detail))
      px[i + 2] = Math.max(0, Math.min(255, g * 0.6 + detail - edge))
    }
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 88 })
    .toBuffer()
}

const SIZES = [
  [4032, 3024],
  [3024, 4032],
  [1080, 1920],
  [1600, 1200],
  [2048, 2048],
]

const rows = []
console.log('\n=== SYNTHETIC PHOTOGRAPHIC SOURCES ===')
for (const [w, h] of SIZES) {
  const orig = await photoLike(w, h, w % 7)
  for (const set of SETS) {
    const [lo, hi] = band(set)
    const f = fit(w, h, lo, hi)
    if (!f) continue
    const cap = Math.min(...set.map((c) => CAP[c])) * 1024 * 1024
    let out = null
    for (const q of [82, 72, 62, 52]) {
      out = await sharp(orig)
        .rotate()
        .extract({ left: 0, top: 0, width: f.w, height: f.h })
        .jpeg({ quality: q, mozjpeg: true })
        .toBuffer()
      if (out.length <= cap) break
    }
    const cropped = f.w !== w || f.h !== h
    rows.push({
      src: `${w}x${h}`,
      set: set.join('+'),
      cropped,
      orig: orig.length,
      deriv: cropped ? out.length : 0,
    })
    console.log(
      `${String(w + 'x' + h).padEnd(10)} ${set.join('+').padEnd(28)} orig ${(orig.length / 1024).toFixed(0).padStart(5)}KB  ${cropped ? `-> ${f.w}x${f.h}  deriv ${(out.length / 1024).toFixed(0).padStart(5)}KB  x${(1 + out.length / orig.length).toFixed(2)} total` : 'no crop needed          x1.00 total'}`,
    )
  }
}

console.log('\n=== REAL FILES IN THIS REPO (brand PNGs — illustrations, not photographs) ===')
const dirs = ['public/MASCOT', 'public/LOGOS', 'apps/web/public/brand']
let realOrig = 0,
  realDeriv = 0,
  realN = 0
for (const d of dirs) {
  let names = []
  try {
    names = readdirSync(join('..', '..', d))
  } catch {
    continue
  }
  for (const n of names.filter((n) => /\.png$/i.test(n))) {
    const p = join('..', '..', d, n)
    const size = statSync(p).size
    const m = await sharp(p).metadata()
    const f = fit(m.width, m.height, 0.75, 1.91)
    if (!f) continue
    const cropped = f.w !== m.width || f.h !== m.height
    if (!cropped) continue
    const out = await sharp(p)
      .rotate()
      .extract({ left: 0, top: 0, width: f.w, height: f.h })
      .png({ compressionLevel: 9 })
      .toBuffer()
    realOrig += size
    realDeriv += out.length
    realN++
    console.log(
      `${n.padEnd(18)} ${String(m.width + 'x' + m.height).padEnd(11)} ${(size / 1024).toFixed(0).padStart(5)}KB -> ${f.w}x${f.h} ${(out.length / 1024).toFixed(0).padStart(5)}KB  x${(1 + out.length / size).toFixed(2)}`,
    )
  }
}
if (realN)
  console.log(
    `\n  ${realN} real files needing a crop: total x${(1 + realDeriv / realOrig).toFixed(2)}`,
  )

const needing = rows.filter((r) => r.cropped)
const avgOrig = rows.reduce((a, r) => a + r.orig, 0) / rows.length
const avgDeriv = needing.reduce((a, r) => a + r.deriv, 0) / (needing.length || 1)
console.log('\n=== SUMMARY (synthetic photographic) ===')
console.log(`cases measured                : ${rows.length}`)
console.log(
  `cases needing a crop          : ${needing.length} (${((needing.length / rows.length) * 100).toFixed(0)}%)`,
)
console.log(`average original              : ${(avgOrig / 1024).toFixed(0)} KB`)
console.log(`average derivative (when made): ${(avgDeriv / 1024).toFixed(0)} KB`)
console.log(`derivative / original          : ${(avgDeriv / avgOrig).toFixed(2)}x`)
console.log(`multiplier per CROPPED photo   : ${(1 + avgDeriv / avgOrig).toFixed(2)}x`)
console.log(
  `multiplier across ALL cases    : ${(rows.reduce((a, r) => a + r.orig + r.deriv, 0) / rows.reduce((a, r) => a + r.orig, 0)).toFixed(2)}x`,
)
