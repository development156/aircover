#!/usr/bin/env node
/**
 * Does the variance instrument actually detect invisible text?
 *
 * A sweep that reports `inv=0` everywhere is indistinguishable from a sweep
 * whose detector is broken. So: build two crops with KNOWN answers and check
 * the numbers come out on the right side of the threshold.
 */
const ROOT = '/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-qa'
const sharp = (
  await import(`${ROOT}/node_modules/.pnpm/sharp@0.34.5/node_modules/sharp/lib/index.js`)
).default
import fs from 'node:fs'
import path from 'node:path'

async function sd(buf) {
  const { data } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true })
  let s = 0
  for (const v of data) s += v
  const m = s / data.length
  let a = 0
  for (const v of data) a += (v - m) ** 2
  return { sd: +Math.sqrt(a / data.length).toFixed(2), mean: Math.round(m) }
}

// 1. A synthetic control: white-on-white text (the exact defect class) vs black-on-white.
const mk = (fg, bg) =>
  sharp({ create: { width: 300, height: 40, channels: 3, background: bg } })
    .composite([
      {
        input: Buffer.from(
          `<svg width="300" height="40"><text x="4" y="28" font-size="22" fill="${fg}">Connect a channel</text></svg>`,
        ),
        top: 0,
        left: 0,
      },
    ])
    .png()
    .toBuffer()

const invisible = await mk('#ffffff', '#ffffff')
const visible = await mk('#111111', '#ffffff')
const lowContrast = await mk('#f2f2f2', '#ffffff')
console.log('CONTROL white-on-white   ->', await sd(invisible), '(must be < 1.0)')
console.log('CONTROL black-on-white   ->', await sd(visible), '(must be >> 4.0)')
console.log('CONTROL near-white       ->', await sd(lowContrast), '(should land low)')

// 2. Are the captured dark frames actually dark?
const dir = path.join(ROOT, '.qa', 'frames')
const frames = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.includes('__dark')) : []
console.log('\ndark frames captured:', frames.length)
for (const f of frames.slice(0, 5)) {
  const meta = await sharp(path.join(dir, f)).metadata()
  const stats = await sharp(path.join(dir, f)).greyscale().stats()
  console.log(
    ` ${f.padEnd(42)} ${meta.width}x${meta.height} meanLuma=${Math.round(stats.channels[0].mean)}`,
  )
}
