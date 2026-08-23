#!/usr/bin/env node
/**
 * ACCENT SPEND — saturated pixels as a fraction of a frame.
 *
 * docs/37 §2.3 measures the accent as a per-screen BUDGET and quotes the
 * reference's /settings at 0.030% against Sahoda's 0.505% — "17× more orange on
 * a screen whose entire job is configuration". That number was produced once, by
 * hand, with Pillow. This file is the same measurement as a program, so the next
 * lane can re-run it instead of re-deriving it.
 *
 * ── THE METHOD, STATED EXACTLY ───────────────────────────────────────────────
 * A pixel counts as accent-bearing when, in HSV, `s > 0.30 AND v > 0.25`.
 * Every second pixel on both axes is sampled (a quarter of the frame), which is
 * what §2.3 did; on a flat-filled UI the quarter-sample and the full sample agree
 * to well under a thousandth, and the alternative is 3 MP of JS per frame.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * 1. It cannot tell brand orange from a PLATFORM MARK. Instagram's gradient and
 *    LinkedIn's blue are saturated and are DELIBERATELY exempt from the ration
 *    (§2.1 — a platform mark is identity, not UI chrome). A screen full of
 *    channel logos therefore scores high without spending any accent. Read the
 *    hue histogram this prints alongside the total before drawing a conclusion.
 * 2. It cannot tell a big faint wash from a small solid fill. 1000px² of
 *    `--brand-wash` at s=0.35 counts exactly as much as 1000px² of solid `--p`.
 *    That is the point — the budget is about how much of the frame reads warm —
 *    but it means a fix that only DILUTES the orange will not move it.
 * 3. It measures ONE viewport-height frame, not the scrolled page. Two screens
 *    with the same content and different fold positions are not comparable.
 * 4. It says nothing about WHETHER the orange is on the right thing. A screen
 *    that spends its whole budget on the wrong element scores identically to one
 *    that spends it on the right one. §16 is the check for that, and it is not
 *    a number.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import zlib from 'node:zlib'

/** Minimal PNG reader — enough for the 8-bit RGB/RGBA frames Playwright writes. */
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let off = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  const idat = []
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
      if (data[12] !== 0) throw new Error('interlaced PNG unsupported')
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    off += 12 + len
  }
  if (bitDepth !== 8) throw new Error(`bit depth ${bitDepth} unsupported`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (channels === 0) throw new Error(`colour type ${colorType} unsupported`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    const line = raw.subarray(pos, pos + stride)
    pos += stride
    const cur = out.subarray(y * stride, (y + 1) * stride)
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0
      const b = prev ? prev[x] : 0
      const c = prev && x >= channels ? prev[x - channels] : 0
      let v = line[x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 0xff
    }
  }
  return { width, height, channels, data: out }
}

/** HSV saturation and value, in the 0–1 form §2.3's thresholds are written in. */
function sv(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return { s: max === 0 ? 0 : (max - min) / max, v: max / 255 }
}

function hueDeg(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h *= 60
  return h < 0 ? h + 360 : h
}

/**
 * @param file  a PNG
 * @param crop  optional [x, y] origin, to measure only what is INSIDE the shell.
 *              The rail and the topbar are constant across every route, so a
 *              whole-frame figure is mostly a measurement of the chrome; passing
 *              the `#main` origin is what isolates the accent a PAGE spends.
 */
export function accentSpend(file, crop) {
  const { width, height, channels, data } = decodePng(fs.readFileSync(file))
  const x0 = crop?.[0] ?? 0
  const y0 = crop?.[1] ?? 0
  let sampled = 0
  let hot = 0
  // Hue histogram in 30° buckets. Brand orange (#ff6600) is 24°, so buckets 0
  // and 1 are "warm"; everything else is a platform mark or an image.
  const hues = new Array(12).fill(0)
  for (let y = y0; y < height; y += 2) {
    for (let x = x0; x < width; x += 2) {
      const i = y * width * channels + x * channels
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      sampled++
      const { s, v } = sv(r, g, b)
      if (s > 0.3 && v > 0.25) {
        hot++
        hues[Math.min(11, Math.floor(hueDeg(r, g, b) / 30))]++
      }
    }
  }
  const warm = hues[0] + hues[1]
  return {
    file: path.basename(file),
    width,
    height,
    sampled,
    hot,
    percent: (hot / sampled) * 100,
    warmPercent: (warm / sampled) * 100,
    hues,
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2)
  if (files.length === 0) {
    console.error('usage: accent-spend.mjs <frame.png> [...]')
    process.exit(2)
  }
  const rows = files.map(accentSpend)
  const wide = Math.max(...rows.map((r) => r.file.length))
  for (const r of rows) {
    console.log(
      `${r.file.padEnd(wide)}  ${r.percent.toFixed(3).padStart(7)}%  ` +
        `(warm-only ${r.warmPercent.toFixed(3)}%)  ${r.width}x${r.height}`,
    )
  }
}
