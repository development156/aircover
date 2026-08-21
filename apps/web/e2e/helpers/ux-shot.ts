import { createHash } from 'node:crypto'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Page } from '@playwright/test'

import { DETECTORS } from './ux-detect'

/**
 * The capture side of the UX lane.
 *
 * ── WHY EVERY FRAME CARRIES ITS OWN MEASUREMENTS ─────────────────────────────
 * A screenshot proves what is there; a measurement proves what a screenshot
 * cannot show — an accessible name, a cursor, a 464px-wide document inside a
 * 390px viewport. Taking them at the same instant, in the same row, is the only
 * way the two can never disagree about which frame they describe.
 *
 * Every detector used here is calibrated first by `ux-detector-selftest.spec.ts`
 * against a page whose right answer is known. Nothing in this file may be
 * believed if that spec is red.
 *
 * ── AND WHY THE ROW RECORDS THE THEME THE DOM ACTUALLY RESOLVED ──────────────
 * Dark is chosen by an inline <head> script reading `localStorage`, so a test
 * that pokes `documentElement.dataset.theme` after load gets reverted on the
 * next navigation and captures LIGHT frames labelled dark. `domTheme` is read
 * off the live document at shutter time, so a mislabelled frame is visible in
 * the manifest instead of being believed.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
export const UX_OUT = process.env.UX_OUT ?? join(HERE, '..', '..', '..', '..', '.ux')
const MANIFEST = join(UX_OUT, 'manifest.jsonl')

export type Theme = 'light' | 'dark'
export const WIDTHS = [390, 1024, 1440] as const

export interface FrameRow {
  journey: string
  stop: string
  route: string
  width: number
  theme: Theme
  /** What `data-theme` actually resolved to. A mismatch with `theme` is a broken frame. */
  domTheme: string | null
  file: string
  bytes: number
  sha: string
  /** Milliseconds from navigation start to shutter, when the stop navigated. */
  ms: number | null
  title: string
  note?: string
  d: Record<string, unknown>
}

/**
 * How many frames this process has actually written.
 *
 * Exists so a capture spec can assert it captured something. Without it a run
 * whose selectors all missed, or whose account never signed in, writes zero PNGs
 * and reports green — which is the "a harness that cannot tell nothing-broke from
 * nothing-ran" failure, and it is the reason apps/web's lint refuses a test file
 * with no expect() in it.
 */
let taken = 0
export function framesTaken(): number {
  return taken
}

export function resetManifest(): void {
  mkdirSync(UX_OUT, { recursive: true })
  writeFileSync(MANIFEST, '')
}

/**
 * Put the browser in a known theme for every SUBSEQUENT navigation.
 *
 * `addInitScript` runs before the page's own scripts, so the app's inline
 * ThemeScript reads the value we seeded rather than the OS default. Light is set
 * EXPLICITLY, not left absent: absence means "follow the OS", and a machine in
 * dark mode would then hand back dark frames labelled light.
 */
export async function useTheme(page: Page, theme: Theme): Promise<void> {
  await page.emulateMedia({ colorScheme: theme })
  await page.addInitScript((value) => {
    try {
      window.localStorage.setItem('sahoda-theme', value as string)
    } catch {
      /* storage disabled: the emulated colour scheme is then the only signal */
    }
  }, theme as string)
}

/** Ask the reduced-motion question for the rest of this page's life. */
export async function useReducedMotion(page: Page, on: boolean): Promise<void> {
  await page.emulateMedia({ reducedMotion: on ? 'reduce' : 'no-preference' })
}

/** Run every calibrated detector against the live document. */
export async function measure(page: Page): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  for (const [name, src] of Object.entries(DETECTORS)) {
    try {
      out[name] = await page.evaluate(src)
    } catch (error) {
      out[name] = { error: error instanceof Error ? error.message : String(error) }
    }
  }
  return out
}

export interface ShotOptions {
  journey: string
  stop: string
  width: number
  theme: Theme
  ms?: number | null
  note?: string
  /** Viewport-only frame. Default is fullPage, which is what shows a page that runs long. */
  viewportOnly?: boolean
}

/**
 * Take the frame, measure the page, and append one manifest row describing both.
 *
 * `bytes` and `sha` are recorded for de-duplication and for spotting a
 * placeholder — but a frame is NEVER accepted on byte size alone. Lightpanda
 * writes a 3KB placeholder PNG that passes any size gate; only opening the file
 * settles it, and opening every file is the point of this lane.
 */
export async function shot(page: Page, opts: ShotOptions): Promise<FrameRow> {
  const d = await measure(page)
  const url = new URL(page.url())
  const domTheme = await page
    .evaluate(() => document.documentElement.getAttribute('data-theme'))
    .catch(() => null)
  const title = await page.title().catch(() => '')
  const slug = `${opts.journey}__${opts.stop}__${opts.width}__${opts.theme}`.replace(
    /[^a-zA-Z0-9._-]/g,
    '-',
  )
  const dir = join(UX_OUT, opts.journey)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${slug}.png`)
  const buf = await page.screenshot({ path: file, fullPage: !opts.viewportOnly })
  const row: FrameRow = {
    journey: opts.journey,
    stop: opts.stop,
    route: url.pathname + url.search,
    width: opts.width,
    theme: opts.theme,
    domTheme,
    file,
    bytes: buf.byteLength,
    sha: createHash('sha256').update(buf).digest('hex').slice(0, 16),
    ms: opts.ms ?? null,
    title,
    ...(opts.note ? { note: opts.note } : {}),
    d,
  }
  mkdirSync(UX_OUT, { recursive: true })
  appendFileSync(MANIFEST, JSON.stringify(row) + '\n')
  taken += 1
  return row
}

/** Navigate and return how long the page took to settle. */
export async function timedGoto(page: Page, path: string): Promise<number> {
  const t0 = Date.now()
  await page.goto(path, { waitUntil: 'domcontentloaded' }).catch(() => {})
  // `networkidle` is discouraged by Playwright and hangs on a page holding an
  // open stream; `load` plus a short settle is what a person's eye waits for.
  await page.waitForLoadState('load').catch(() => {})
  await page.waitForTimeout(500)
  return Date.now() - t0
}
