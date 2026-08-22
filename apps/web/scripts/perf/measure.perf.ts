import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CDPSession, Page } from '@playwright/test'

import { test, adminClient } from '../../e2e/fixtures/seeded-user'
import { ROUTES } from '../../e2e/helpers/ux-routes'

/**
 * Every route, measured.
 *
 * ── WHAT EACH NUMBER IS, AND WHERE IT COMES FROM ─────────────────────────────
 * Nothing here is estimated. Each figure is read from an API the browser already
 * keeps, and the two that are not — query count and query time — are read from a
 * log the server writes for every outbound call.
 *
 *   ttfb    navigation timing `responseStart - requestStart`
 *   fcp     paint timing, `first-contentful-paint`
 *   lcp     PerformanceObserver, `largest-contentful-paint`, last entry
 *   tbt     the long-task blocking share: sum of (duration - 50) over tasks
 *           after FCP. Not TTI's exact definition — stated so, not implied.
 *   jsBytes sum of `encodedBodySize` over script resources on this navigation
 *   queries lines the outbound-call counter appended while this route loaded
 *
 * ── WHY THE COUNTER IS A FETCH PRELOAD AND NOT AN INSTRUMENTED CLIENT ────────
 * `createServerSupabase()` is not the only way a route can reach Postgres —
 * middleware calls PostgREST with a bare `fetch`, and a package may build its own
 * client. A counter wired into one client would certify a route that used
 * another, which is the blind spot a detector inherits from the code it audits.
 * Wrapping `globalThis.fetch` before Next loads sees all of them.
 */

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../../perf-results')

/** Where the server's `--require` preload appends one JSON line per outbound call. */
const QLOG = process.env.SAHODA_QLOG ?? resolve(OUT, 'qlog.jsonl')

/**
 * A mid-range Android on Indian mobile data.
 *
 * These are the numbers this product's customers actually have, and they are
 * stated here rather than named ("Slow 4G") so nobody has to look up what a
 * preset meant in some version of some tool. Latency and throughput are CDP's
 * own units; the CPU multiplier is measured against the machine running this.
 */
const THROTTLE = {
  latencyMs: 300,
  downloadKbps: 1_600,
  uploadKbps: 750,
  cpuSlowdown: 4,
} as const

interface Sample {
  route: string
  data: 'no-workspace' | 'workspace-empty' | 'seeded'
  network: 'fast' | 'throttled'
  status: number
  ttfbMs: number
  fcpMs: number | null
  lcpMs: number | null
  tbtMs: number
  lcpElement: string | null
  jsBytes: number
  requests: number
  queries: number
  queryMs: number
  rpc: number
  clerk: number
}

function qlogLines(): number {
  if (!existsSync(QLOG)) return 0
  const raw = readFileSync(QLOG, 'utf8')
  return raw === '' ? 0 : raw.split('\n').filter((l) => l !== '').length
}

function qlogSince(mark: number): Array<Record<string, unknown>> {
  if (!existsSync(QLOG)) return []
  return readFileSync(QLOG, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .slice(mark)
    .map((l) => {
      try {
        return JSON.parse(l) as Record<string, unknown>
      } catch {
        return {}
      }
    })
}

/** Registered before any navigation, because LCP and long tasks are not retroactive. */
const OBSERVE = `
  window.__perf = { lcp: null, lcpEl: null, longTasks: [] }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        window.__perf.lcp = e.startTime
        const el = e.element
        window.__perf.lcpEl = el
          ? el.tagName.toLowerCase() +
            (el.id ? '#' + el.id : '') +
            (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.')
              : '')
          : e.url || null
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__perf.longTasks.push({ s: e.startTime, d: e.duration })
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
`

async function setNetwork(cdp: CDPSession, throttled: boolean): Promise<void> {
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: throttled ? THROTTLE.latencyMs : 0,
    downloadThroughput: throttled ? (THROTTLE.downloadKbps * 1024) / 8 : -1,
    uploadThroughput: throttled ? (THROTTLE.uploadKbps * 1024) / 8 : -1,
  })
  await cdp.send('Emulation.setCPUThrottlingRate', {
    rate: throttled ? THROTTLE.cpuSlowdown : 1,
  })
}

async function sampleRoute(
  page: Page,
  route: string,
  data: Sample['data'],
  network: Sample['network'],
): Promise<Sample> {
  const mark = qlogLines()
  const response = await page.goto(route, { waitUntil: 'load' })
  // LCP is only final once the page stops changing. A short settle is honest
  // about that; waiting for networkidle would fold Clerk's polling into the number.
  await page.waitForTimeout(1_500)

  const raw = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
    const paints = performance.getEntriesByType('paint')
    const fcp = paints.find((p) => p.name === 'first-contentful-paint')
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[]
    const scripts = resources.filter(
      (r) =>
        r.initiatorType === 'script' ||
        r.name.endsWith('.js') ||
        r.name.includes('/_next/static/chunks/'),
    )
    const perf = (
      window as unknown as {
        __perf: {
          lcp: number | null
          lcpEl: string | null
          longTasks: Array<{ s: number; d: number }>
        }
      }
    ).__perf
    const fcpAt = fcp ? fcp.startTime : 0
    return {
      ttfb: nav ? nav.responseStart - nav.requestStart : 0,
      fcp: fcp ? fcp.startTime : null,
      lcp: perf.lcp,
      lcpEl: perf.lcpEl,
      tbt: perf.longTasks
        .filter((t) => t.s >= fcpAt)
        .reduce((sum, t) => sum + Math.max(0, t.d - 50), 0),
      jsBytes: scripts.reduce((sum, r) => sum + (r.encodedBodySize || 0), 0),
      requests: resources.length,
    }
  })

  const calls = qlogSince(mark)
  const pg = calls.filter((c) => c.kind === 'postgrest' || c.kind === 'rpc')
  return {
    route,
    data,
    network,
    status: response ? response.status() : 0,
    ttfbMs: +raw.ttfb.toFixed(1),
    fcpMs: raw.fcp === null ? null : +raw.fcp.toFixed(1),
    lcpMs: raw.lcp === null ? null : +raw.lcp.toFixed(1),
    tbtMs: +raw.tbt.toFixed(1),
    lcpElement: raw.lcpEl,
    jsBytes: raw.jsBytes,
    requests: raw.requests,
    queries: pg.length,
    queryMs: +pg.reduce((s, c) => s + (typeof c.ms === 'number' ? c.ms : 0), 0).toFixed(1),
    rpc: calls.filter((c) => c.kind === 'rpc').length,
    clerk: calls.filter((c) => c.kind === 'clerk').length,
  }
}

function write(name: string, samples: Sample[]): void {
  mkdirSync(OUT, { recursive: true })
  writeFileSync(resolve(OUT, name), JSON.stringify(samples, null, 2) + '\n')
}

/**
 * The two runs are DECLARED conditionally, not skipped inside the body.
 *
 * `test.skip()` in a body runs AFTER the fixtures, so the skipped run still mints
 * a Clerk user and bootstraps a workspace in the production database before
 * deciding it has nothing to do — two tenants created per run to measure one.
 * A module-level branch declares one test and the other never exists.
 */
const SEEDED = process.env.PERF_STATE === 'seeded'

if (!SEEDED)
  test('measure every route — empty workspace', async ({ page, signedIn }) => {
    void signedIn
    mkdirSync(OUT, { recursive: true })
    await page.addInitScript(OBSERVE)
    const cdp = await page.context().newCDPSession(page)

    const samples: Sample[] = []
    for (const network of ['fast', 'throttled'] as const) {
      await setNetwork(cdp, network === 'throttled')
      for (const route of ROUTES) {
        const s = await sampleRoute(page, route, 'no-workspace', network)
        samples.push(s)
        appendFileSync(
          resolve(OUT, 'live.log'),
          `${s.data}\t${s.network}\t${s.route}\t${s.status}\tttfb=${s.ttfbMs}\tfcp=${s.fcpMs}\tlcp=${s.lcpMs}\ttbt=${s.tbtMs}\tjs=${s.jsBytes}\tq=${s.queries}/${s.queryMs}ms\n`,
        )
        // eslint-disable-next-line no-console
        console.log(
          `${network}\t${route}\tttfb=${s.ttfbMs}\tfcp=${s.fcpMs}\tlcp=${s.lcpMs}\ttbt=${s.tbtMs}\tq=${s.queries}`,
        )
      }
    }
    write('empty.json', samples)
  })

/**
 * The same forty routes, against a workspace that has something in it.
 *
 * ── WHY THE SEED IS THIS SIZE ────────────────────────────────────────────────
 * MEASURED against production on 2026-08-23: the busiest of the 26 real
 * workspaces holds 24 posts, 17 variants, 2 connections and 64 ledger rows. So
 * "real data" in this product today is tens of rows, not thousands, and a seed of
 * 40 posts / 80 variants sits at the top of the real range rather than inventing a
 * customer nobody has. A larger seed would answer a question about a product that
 * does not exist yet — P2 answers the growth question with arithmetic on measured
 * per-row cost instead, which is the honest instrument for it.
 *
 * Everything created here hangs off the run's own workspace, which the fixture
 * deletes on teardown. Nothing touches a real tenant's rows.
 */
async function seedWorkspace(
  clerkUserId: string,
): Promise<{ workspaceId: string; posts: number } | null> {
  const admin = adminClient()
  if (admin === null) return null

  // ── BOUND TO THIS RUN'S OWN USER, NEVER "the newest workspace" ─────────────
  // The obvious version of this took the most recently created workspace on the
  // assumption it was the one sign-in had just bootstrapped. It is a shared
  // production database with several sessions on it: any workspace created in the
  // seconds between would have been seeded with forty rows of measurement data
  // belonging to nobody, in a real customer's tenant. `created_by` is the only
  // thing that makes the target this run's own.
  const { data: ws } = await admin.from('workspaces').select('id').eq('created_by', clerkUserId)
  const only = ws === null ? undefined : ws.length === 1 ? ws[0] : undefined
  if (only === undefined) return null
  const workspaceId = only.id as string

  const CHANNELS = ['instagram', 'linkedin'] as const
  const posts = Array.from({ length: 40 }, (_, i) => ({
    workspace_id: workspaceId,
    title: `Measurement post ${i + 1}`,
    body: `A body of roughly the length a real caption has, written so the row is not degenerate. Item ${i + 1}.`,
    status:
      i % 4 === 0 ? 'approved' : i % 4 === 1 ? 'draft' : i % 4 === 2 ? 'scheduled' : 'published',
    channels: i % 3 === 0 ? [CHANNELS[0]] : [CHANNELS[0], CHANNELS[1]],
    scheduled_at: new Date(Date.now() + (i - 20) * 86_400_000).toISOString(),
    // MEASURED against the production constraint, not guessed from the composer's
    // vocabulary: posts_origin_check allows manual | plan_week | playbook | radar
    // only, and 'composer' — the word the UI uses — is refused by the database.
    origin: 'manual',
  }))
  const { data: inserted, error } = await admin.from('posts').insert(posts).select('id, channels')
  if (error || !inserted) return { workspaceId, posts: 0 }

  const variants = inserted.flatMap((post) =>
    (post.channels as string[]).map((channel) => ({
      workspace_id: workspaceId,
      post_id: post.id as string,
      channel,
      body: 'A per-channel body, long enough that the character counter has something to count.',
      publish_status: 'pending',
    })),
  )
  await admin.from('post_variants').insert(variants)
  return { workspaceId, posts: inserted.length }
}

if (SEEDED)
  test('measure every route — seeded workspace', async ({ page, signedIn }) => {
    mkdirSync(OUT, { recursive: true })

    /**
     * ── SIGNING IN DOES NOT CREATE A WORKSPACE, AND THAT COST A RUN ──────────
     * The first version of this assumed it did, seeded nothing, and measured
     * forty routes of a WORKSPACE-LESS account while labelling them `seeded`.
     * Nothing in the output said so: every figure was real, and every one
     * answered a different question from the one that was asked.
     *
     * `bootstrap_workspace` runs from a server action behind the empty state's
     * "Create workspace" button and from nowhere else, so a fresh account has
     * none until something presses it. Scoped to `#main` because a
     * workspace-less account is offered the bootstrap twice — once in the
     * topbar switcher and once as the empty state's primary action.
     */
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })

    // NOTE: the seed happens inside the state loop below, NOT here. It sat here
    // once, left over from an earlier shape of this file, which meant the
    // `workspace-empty` pass ran against a workspace that already held forty
    // posts — forty rows of real measurements under a label that said the
    // opposite. Caught by asking the database how many posts the workspace held
    // while the run was still emitting `workspace-empty`, not by reading the log.

    await page.addInitScript(OBSERVE)
    const cdp = await page.context().newCDPSession(page)
    const samples: Sample[] = []
    // THREE states, not two, and from ONE production account.
    //
    // "no workspace" and "workspace with nothing in it" are different screens
    // reached by different code paths — every read short-circuits before touching
    // the database on the first and does not on the second — so folding them
    // together would answer "does data cost anything" with a number that is
    // mostly about whether a workspace exists at all.
    for (const state of ['workspace-empty', 'seeded'] as const) {
      if (state === 'seeded') {
        const seeded = await seedWorkspace(signedIn.clerkUserId)
        // eslint-disable-next-line no-console
        console.log(`seeded: ${JSON.stringify(seeded)}`)
        if (seeded === null || seeded.posts === 0) {
          throw new Error(
            `seed failed (${JSON.stringify(seeded)}) — refusing to record empty numbers as seeded`,
          )
        }
      }
      for (const network of ['fast', 'throttled'] as const) {
        await setNetwork(cdp, network === 'throttled')
        for (const route of ROUTES) {
          const s = await sampleRoute(page, route, state, network)
          samples.push(s)
          appendFileSync(
            resolve(OUT, 'live.log'),
            `${s.data}\t${s.network}\t${s.route}\t${s.status}\tttfb=${s.ttfbMs}\tfcp=${s.fcpMs}\tlcp=${s.lcpMs}\ttbt=${s.tbtMs}\tjs=${s.jsBytes}\tq=${s.queries}/${s.queryMs}ms\n`,
          )
          // eslint-disable-next-line no-console
          console.log(
            `${state}\t${network}\t${route}\tttfb=${s.ttfbMs}\tfcp=${s.fcpMs}\tlcp=${s.lcpMs}\ttbt=${s.tbtMs}\tq=${s.queries}`,
          )
        }
      }
      // Written after EACH state, so a run that dies in the second still leaves
      // the first state's forty measurements on disk rather than nothing.
      write('seeded.json', samples)
    }
  })
