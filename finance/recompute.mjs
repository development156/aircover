#!/usr/bin/env node
/**
 * SAHODA LABS — pricing and unit-economics engine.
 *
 * Reads finance/pricing-model.json and prints every derived figure in
 * docs/22_Pricing_SAHODA_LABS.md. Node, standard library only.
 *
 *   node finance/recompute.mjs            full run
 *   node finance/recompute.mjs --terse    headline block only
 *
 * A model price change is a one-number edit in the JSON and a re-run.
 *
 * TWO MODELS ARE COMPUTED EVERYWHERE AND NEVER BLENDED:
 *   AS-IS        what the code on wt-web@c8faa34 actually does.
 *   AS-DESIGNED  the spec pack's intent with all six Margin Engine levers working.
 * The gap between them is the value of the unbuilt Margin Engine, in rupees.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const M = JSON.parse(readFileSync(join(HERE, 'pricing-model.json'), 'utf8'))
const TERSE = process.argv.includes('--terse')

// ── formatting ───────────────────────────────────────────────────────────────
const FX = M.fx.inr_per_usd.value
const inr = (usd) => usd * FX
const r = (n, d = 2) => Number(n.toFixed(d))
const rs = (n, d = 0) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d })
const usd = (n, d = 4) => '$' + n.toFixed(d)
const pct = (n, d = 1) => (n * 100).toFixed(d) + '%'
const h1 = (s) => {
  if (!TERSE) console.log('\n' + '='.repeat(78) + '\n' + s + '\n' + '='.repeat(78))
}
const h2 = (s) => {
  if (!TERSE) console.log('\n── ' + s + ' ' + '─'.repeat(Math.max(0, 74 - s.length)))
}
const say = (...a) => {
  if (!TERSE) console.log(...a)
}
const table = (rows) => {
  if (TERSE || !rows.length) return
  const cols = Object.keys(rows[0])
  const w = cols.map((c) => Math.max(c.length, ...rows.map((x) => String(x[c]).length)))
  const line = (cells) => '  ' + cells.map((c, i) => String(c).padEnd(w[i])).join('  ')
  console.log(line(cols))
  console.log('  ' + w.map((n) => '-'.repeat(n)).join('  '))
  rows.forEach((x) => console.log(line(cols.map((c) => x[c]))))
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 1 — THE TRUE COST FLOOR
// ═════════════════════════════════════════════════════════════════════════════

const P = M.model_prices_usd_per_1m
const REPAIR = M.repair.rate

/**
 * Cost of one text call.
 * AS-IS:       every input token at the fresh rate. No cache, no batch.
 * AS-DESIGNED: the cacheable prefix at 0.1x, batch at 0.5x on both legs where
 *              the action is deferrable, and the complexity classifier's own
 *              recorded routing decision in force.
 */
function textCall(a, mode, band = 'base') {
  const modelKey = mode === 'designed' && a.as_designed_model ? a.as_designed_model : a.model
  const p = P[modelKey]
  const tin = a['in_' + band] ?? a.in_base
  const tout = band === 'high' && a.out_high ? a.out_high : a.out
  const batch = mode === 'designed' && a.batchable
  const rateIn = batch ? p.batch_in : p.in
  const rateOut = batch ? p.batch_out : p.out
  const rateCached = batch ? p.cached_in / 2 : p.cached_in

  let first
  if (mode === 'designed' && a.cacheable_in > 0) {
    const cached = Math.min(a.cacheable_in, tin)
    const fresh = tin - cached
    first = (fresh * rateIn + cached * rateCached + tout * rateOut) / 1e6
  } else {
    first = (tin * rateIn + tout * rateOut) / 1e6
  }
  // A repair resends everything plus the failed output plus ~40 tokens of instruction.
  const repair = ((tin + tout + 40) * rateIn + tout * rateOut) / 1e6
  return { first, repair, expected: first + REPAIR.base * repair, worst: first + repair }
}

function actionCost(key, mode, band = 'base') {
  const a = M.actions[key]
  if (a.flat_usd) return { first: a.flat_usd, repair: 0, expected: a.flat_usd, worst: a.flat_usd }
  return textCall(a, mode, band)
}

const WIRED = [
  'caption_rewrite',
  'post_variants',
  'loop_cycle',
  'image_standard',
  'brand_research',
  'site_generate',
]

h1('PHASE 1 — THE TRUE COST FLOOR')
say(`FX ${FX} INR/USD (MEASURED ${M.fx.inr_per_usd.source.slice(0, 60)}...)`)
say(
  `The code hardcodes ${M.fx.code_hardcodes.value} at ${M.fx.code_hardcodes.source} — stale by ${pct(FX / M.fx.code_hardcodes.value - 1)}.`,
)

h2('1.1 Cost per action, per invocation — the six that can be charged')
const perAction = WIRED.map((k) => {
  const a = M.actions[k]
  const isIs = actionCost(k, 'is')
  const de = actionCost(k, 'designed')
  const lo = actionCost(k, 'is', 'low')
  const hi = actionCost(k, 'is', 'high')
  return {
    action: k,
    cr: a.credits,
    model: a.model.replace('gemini-2.5-flash-image', 'gemini-img'),
    'AS-IS $': usd(isIs.expected),
    'AS-IS Rs': r(inr(isIs.expected), 3),
    'AS-DES $': usd(de.expected),
    'AS-DES Rs': r(inr(de.expected), 3),
    saving: pct(1 - de.expected / isIs.expected),
    'Rs low': r(inr(lo.first), 3),
    'Rs high': r(inr(hi.worst), 3),
  }
})
table(perAction)
say('\n  "Rs high" is the worst case: the high input/output band WITH a repair.')
say(
  '  Repair rate applied to the expected column: ' +
    pct(REPAIR.base) +
    ' (INFERRED, ' +
    REPAIR.basis.slice(0, 70) +
    '...)',
)

h2('1.2 What the Margin Engine is worth, per action')
say('  Each lever, isolated, against the AS-IS baseline:')
const levers = WIRED.filter((k) => !M.actions[k].flat_usd).map((k) => {
  const a = M.actions[k]
  const base = actionCost(k, 'is').expected
  // cache only
  const cacheOnly = textCall(
    { ...a, batchable: false, as_designed_model: null },
    'designed',
  ).expected
  // batch only
  const batchOnly = textCall(
    { ...a, cacheable_in: 0, as_designed_model: null },
    'designed',
  ).expected
  // classifier only
  const classOnly = textCall({ ...a, cacheable_in: 0, batchable: false }, 'designed').expected
  return {
    action: k,
    'baseline Rs': r(inr(base), 3),
    'caching saves': pct(1 - cacheOnly / base),
    'batch saves': a.batchable ? pct(1 - batchOnly / base) : 'n/a',
    'routing saves': a.as_designed_model ? pct(1 - classOnly / base) : 'n/a',
  }
})
table(levers)
say('\n  Caching is the lever the spec pack leans on hardest and it is worth almost nothing,')
say(
  '  because the cacheable prefix is ~175 tokens and the minimums are 4096 (haiku) / 1024 (sonnet, opus).',
)
say(
  '  It does not clear either floor on any of the four tasks that declare it, so today it saves 0%.',
)
say('  The figures above are what it WOULD save if the prefix qualified.')

// ── usage profile ────────────────────────────────────────────────────────────
const U = M.usage_profile
function profile(band) {
  const loops = U.loops_per_month[band]
  const briefs = loops * U.briefs_per_loop.value
  const variants = briefs * U.brief_to_variants_rate[band]
  return {
    loop_cycle: loops,
    post_variants: variants,
    image_standard: variants * U.variants_to_image_rate[band],
    caption_rewrite: U.caption_rewrites_per_month[band],
    site_generate: U.site_generates_per_month[band],
    brand_research: 0, // one-time at signup, costed separately
  }
}

h2('1.3 The derived usage profile — from product defaults, not invention')
say('  The Loop is weekly and plan_week returns EXACTLY 5 briefs by schema')
say('  (' + U.briefs_per_loop.source + ').')
say('  Everything else is a conversion rate off those five briefs.')
const bands = ['low', 'base', 'high']
table(
  bands.map((b) => {
    const p = profile(b)
    return {
      band: b === 'base' ? 'base (designed cadence)' : b,
      loops: r(p.loop_cycle, 2),
      variants: r(p.post_variants, 1),
      images: r(p.image_standard, 1),
      rewrites: r(p.caption_rewrite, 1),
      sites: r(p.site_generate, 2),
      'credits burned': r(
        WIRED.reduce((s, k) => s + (p[k] || 0) * M.actions[k].credits, 0),
        0,
      ),
    }
  }),
)

const grants = { free: 100, starter: 1500, growth: 5000, agency: 15000 }
const burnBase = WIRED.reduce((s, k) => s + (profile('base')[k] || 0) * M.actions[k].credits, 0)
const burnHigh = WIRED.reduce((s, k) => s + (profile('high')[k] || 0) * M.actions[k].credits, 0)
say('')
say('  THE CREDIT GRANTS DO NOT BIND. A workspace running the product at its own designed')
say(`  weekly cadence burns ${r(burnBase, 0)} credits/month. Against the placeholder grants:`)
table(
  Object.entries(grants).map(([k, v]) => ({
    plan: k,
    grant: v,
    'x designed burn': r(v / burnBase, 1) + 'x',
    'x heaviest burn': r(v / burnHigh, 1) + 'x',
  })),
)
say('  Even the FREE grant of 100 covers half of full designed usage. Credits cannot fence,')
say('  cannot create upgrade pressure, and cannot cap downside. That is an arithmetic fact')
say('  about the product defaults, independent of any placeholder price.')

// ── AI COGS per workspace ────────────────────────────────────────────────────
function aiCogs(band, mode) {
  const p = profile(band)
  return WIRED.reduce(
    (s, k) => s + (p[k] || 0) * actionCost(k, mode, band === 'high' ? 'high' : 'base').expected,
    0,
  )
}

h2('1.4 AI COGS per active workspace per month')
table(
  bands.map((b) => {
    const i = aiCogs(b, 'is'),
      d = aiCogs(b, 'designed')
    return {
      band: b,
      'AS-IS $': usd(i, 4),
      'AS-IS Rs': rs(inr(i), 2),
      'AS-DES $': usd(d, 4),
      'AS-DES Rs': rs(inr(d), 2),
      'engine saves': pct(1 - d / i),
    }
  }),
)
const imgShare =
  (profile('base').image_standard * M.actions.image_standard.flat_usd) / aiCogs('base', 'is')
say(
  `\n  Image generation is ${pct(imgShare)} of AI COGS at the base mix, and NO lever touches it —`,
)
say('  it is a per-image meter, not a token meter. That is why the whole Margin Engine is')
say(`  worth only ${pct(1 - aiCogs('base', 'designed') / aiCogs('base', 'is'))} at this mix.`)

// ── Zernio, three scenarios ──────────────────────────────────────────────────
const Z = M.zernio
const ZRATE = Z.usd_per_account_month.value
function zernioUsd(channels, scenario) {
  const s = Z.scenarios[scenario]
  // No connected account means no billable unit under ANY reading of the cap.
  if (channels === 0) return 0
  if (scenario === 'S3_per_profile') return ZRATE
  return ZRATE * channels * s.active_rate
}

h2('1.5 Zernio — the cost line that decides everything')
say(
  `  ${ZRATE} USD per connected account per month (DISPUTED — ${Z.usd_per_account_month.note.slice(0, 90)}...)`,
)
say('  Three cap readings, carried forward as a range rather than averaged:')
table(
  [1, 2, 4].map((ch) => ({
    channels: ch,
    'S1 per-account Rs': rs(inr(zernioUsd(ch, 'S1_per_connected_account')), 0),
    'S2 per-active Rs': rs(inr(zernioUsd(ch, 'S2_per_active_account')), 0),
    'S3 per-profile Rs': rs(inr(zernioUsd(ch, 'S3_per_profile')), 0),
  })),
)
say('')
say('  AGAINST AI COGS OF ' + rs(inr(aiCogs('base', 'is')), 0) + '/MONTH AT THE DESIGNED CADENCE:')
say(
  `  a 2-channel workspace costs ${rs(inr(zernioUsd(2, 'S1_per_connected_account')), 0)}/month on the publishing rail under S1.`,
)
say(
  `  That is ${r(zernioUsd(2, 'S1_per_connected_account') / aiCogs('base', 'is'), 0)}x the AI bill.`,
)
say('  AI inference is not the dominant COGS in this product. The aggregator is.')
say('')
say('  CAVEAT WITH TEETH: all publish-driven cost is currently ZERO, because')
say('  SAHODA_PUBLISH_MODE defaults to fixture and three other flags default off')
say('  (' + Z.publish_flags_default_off.source + ').')
say('  Their runtime values are unknown. Zernio bills on connected accounts, though,')
say('  and connecting a channel is a live OAuth flow — so the account cost may accrue')
say('  even while publishing is switched off. That distinction is worth a real answer.')

// ── one-time cost per signup ─────────────────────────────────────────────────
h2('1.6 One-time cost per signup — and it is charged to nobody')
const bg = M.actions.brand_research
const resolveOnly = textCall(bg, 'is').first
const pdfDoorBase =
  resolveOnly +
  textCall({ ...M.actions.brand_research, in_base: 8000, out: 2846, cacheable_in: 0 }, 'is').first
const pdfDoorWorst =
  resolveOnly +
  2 *
    textCall({ ...M.actions.brand_research, in_base: 25000, out: 2846, cacheable_in: 0 }, 'is')
      .worst +
  0.006
table([
  {
    path: 'URL/sentence door (no extract call at all)',
    calls: 1,
    $: usd(resolveOnly),
    Rs: rs(inr(resolveOnly), 2),
    'credits collected': 0,
  },
  {
    path: 'PDF door, free engine succeeds',
    calls: 2,
    $: usd(pdfDoorBase),
    Rs: rs(inr(pdfDoorBase), 2),
    'credits collected': 0,
  },
  {
    path: 'PDF door, OCR escalation, both repair',
    calls: 5,
    $: usd(pdfDoorWorst),
    Rs: rs(inr(pdfDoorWorst), 2),
    'credits collected': 0,
  },
])
say('\n  The first brand resolve is free and UNBOUNDED. The gate asks "has this workspace ever')
say('  SAVED a Brand Brain", not "has it ever spent credits", and the code records the hole')
say('  in its own words (apps/web/src/lib/onboarding/read-brain.ts:43-47). No rate limiter')
say('  guards the server action. A user who never approves keeps resolving free forever.')

// ── payment, support, fixed ──────────────────────────────────────────────────
const PAY = M.payments
const mdrEff = (PAY.upi_mdr_pct.value / 100) * (1 + PAY.gst_on_mdr_pct.value / 100)
const support = M.support.cost_per_minute_inr.base * M.support.minutes_per_customer_month.base
const supportHigh = M.support.cost_per_minute_inr.high * M.support.minutes_per_customer_month.high

h2('1.7 Per-transaction, support, and the fixed platform floor')
say(
  `  UPI MDR ${PAY.upi_mdr_pct.value}% ex-GST -> ${pct(mdrEff, 3)} effective (MEASURED, ${PAY._source.slice(0, 50)}...)`,
)
say(
  `  UPI AutoPay per debit: ${rs(PAY.upi_autopay_debit_inr_under_1000.value)} below Rs1,000, ${rs(PAY.upi_autopay_debit_inr_1000_plus.value)} at or above.`,
)
say('  That threshold TRIPLES the fee and is a real pricing-design constant.')
say(`  Refund fee and chargeback fee: BLOCKED — not published on any fetchable page.`)
say('')
say(
  `  Support: ${rs(support)}/customer/month base, ${rs(supportHigh)}/month high (INFERRED — no ticket data exists).`,
)
const fixedUsd = Object.entries(M.platform_fixed_usd_month)
  .filter(([k]) => !k.startsWith('_'))
  .reduce((s, [, v]) => s + v.value, 0)
say(`  Fixed platform floor: ${usd(fixedUsd, 2)}/month = ${rs(inr(fixedUsd))}/month TODAY.`)
say('  Clerk is $0 because production runs a development instance; Trigger.dev, Cloudflare,')
say('  Resend and Sentry are $0 because they are not deployed, not used, or on free tiers.')

h2('1.8 FULLY-LOADED COST TO SERVE ONE ACTIVE WORKSPACE FOR ONE MONTH')
function fullyLoaded(band, mode, channels, scenario, nWorkspaces = 100) {
  const ai = aiCogs(band, mode)
  const z = zernioUsd(channels, scenario)
  const marginalUsd = ai + z
  const fixedAlloc = fixedUsd / nWorkspaces
  const sup = band === 'high' ? supportHigh : support
  return {
    ai,
    z,
    marginalUsd,
    marginalInr: inr(marginalUsd),
    fixedInr: inr(fixedAlloc),
    supportInr: sup,
    totalInr: inr(marginalUsd + fixedAlloc) + sup,
  }
}
say('  At 100 active workspaces, 2 connected channels, Zernio scenario S1:')
table(
  ['low', 'base', 'high'].map((b) => {
    const f = fullyLoaded(b, 'is', 2, 'S1_per_connected_account')
    const g = fullyLoaded(b, 'designed', 2, 'S1_per_connected_account')
    return {
      band: b === 'base' ? 'P50 base' : b === 'high' ? 'P90 high' : 'low',
      AI: rs(inr(f.ai), 0),
      Zernio: rs(inr(f.z), 0),
      'fixed alloc': rs(f.fixedInr, 0),
      support: rs(f.supportInr, 0),
      'AS-IS total': rs(f.totalInr, 0),
      'AS-DES total': rs(g.totalInr, 0),
    }
  }),
)
say('\n  Marginal cost is stated separately from fixed allocation above. The fixed line falls')
say('  with scale; Zernio does not, and it is the largest single component at every band.')

h2('1.9 Zernio scenario sensitivity on the fully-loaded figure')
table(
  Object.keys(Z.scenarios).map((s) => ({
    scenario: s,
    '1 channel': rs(fullyLoaded('base', 'is', 1, s).totalInr, 0),
    '2 channels': rs(fullyLoaded('base', 'is', 2, s).totalInr, 0),
    '4 channels': rs(fullyLoaded('base', 'is', 4, s).totalInr, 0),
  })),
)

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 2 — THE CREDIT UNIT
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 2 — DERIVING THE CREDIT UNIT')

h2('2.1 Is a credit the right meter at all?')
const cheapest = Math.min(...WIRED.map((k) => actionCost(k, 'is').expected / M.actions[k].credits))
const dearest = Math.max(...WIRED.map((k) => actionCost(k, 'is').expected / M.actions[k].credits))
say(`  COGS per credit varies ${r(dearest / cheapest, 1)}x across the six chargeable actions:`)
table(
  WIRED.map((k) => {
    const c = actionCost(k, 'is').expected
    return {
      action: k,
      credits: M.actions[k].credits,
      'COGS Rs': r(inr(c), 3),
      'COGS per credit Rs': r(inr(c) / M.actions[k].credits, 4),
      index: r(c / M.actions[k].credits / cheapest, 1) + 'x',
    }
  }),
)
say('\n  A single currency across a spread this wide means the credit price is set by the blend,')
say('  and the blend moves with user behaviour. The mix sensitivity that matters is images:')
;[0.1, 0.3, 0.6].forEach((rate) => {
  const p = profile('base')
  const v = p.post_variants
  const imgs = v * rate
  const cogs = WIRED.reduce(
    (s, k) => s + (k === 'image_standard' ? imgs : p[k] || 0) * actionCost(k, 'is').expected,
    0,
  )
  const cr = WIRED.reduce(
    (s, k) => s + (k === 'image_standard' ? imgs : p[k] || 0) * M.actions[k].credits,
    0,
  )
  say(
    `    image attach rate ${pct(rate, 0)}: monthly COGS ${rs(inr(cogs), 2)}, ${r(cr, 0)} credits, ${rs(inr(cogs) / cr, 3)} COGS per credit`,
  )
})

h2('2.2 Required retail price per credit at each target gross margin')
say('  Formula: price_per_credit = COGS_per_credit / (1 - target_gross_margin)')
say(
  '  COGS per credit uses the base action mix; the AI-only view first, then with Zernio loaded in.',
)
const p0 = profile('base')
const creditsMo = WIRED.reduce((s, k) => s + (p0[k] || 0) * M.actions[k].credits, 0)
const aiPerCredit = inr(aiCogs('base', 'is')) / creditsMo
const aiPerCreditDes = inr(aiCogs('base', 'designed')) / creditsMo
const loadedPerCredit =
  fullyLoaded('base', 'is', 2, 'S1_per_connected_account').totalInr / creditsMo
table(
  M.targets.gross_margin_ladder.map((g) => ({
    'target GM': pct(g, 0),
    'AS-IS, AI only': rs(aiPerCredit / (1 - g), 3),
    'AS-DESIGNED, AI only': rs(aiPerCreditDes / (1 - g), 3),
    'AS-IS, fully loaded': rs(loadedPerCredit / (1 - g), 2),
  })),
)
say('\n  The placeholder credit value in the PRD is Rs0.30. The AI-only column is in that')
say('  neighbourhood, which is exactly why the placeholder looked plausible. The fully-loaded')
say('  column is 20-30x higher, because it carries the aggregator the PRD never modelled.')
say('')
say('  THE STRUCTURAL ANSWER: a credit cannot price this product. Two of the four largest')
say('  cost drivers — the Zernio per-account line and the fixed platform floor — do not vary')
say('  with credits consumed at all. They vary with CHANNELS CONNECTED and with WORKSPACES')
say('  EXISTING. A meter that charges for generation while the cost is driven by connection')
say('  is measuring the wrong thing.')

h2('2.3 Top-up rate — the check the placeholders fail')
say('  A top-up must price ABOVE the plan-implied rate or it cannibalises upgrades.')
table(
  Object.entries(grants)
    .filter(([k]) => k !== 'free')
    .map(([k, g]) => {
      const price = { starter: 499, growth: 1499, agency: 3999 }[k]
      return {
        plan: k,
        'placeholder price': rs(price),
        grant: g,
        'implied Rs/credit': rs(price / g, 3),
      }
    }),
)
say('  Placeholder top-up (PRD 01:158) is Rs49 per 100 credits = Rs0.49/credit.')
say('  It clears the highest plan-implied rate (Rs0.333) so the RELATIONSHIP is right —')
say('  but no top-up SKU exists in code, so it contributes nothing today.')
say('')
say('  THE BINDING COMPARISON IS THE CHEAPEST PLAN-IMPLIED RATE, NOT THE DEAREST.')
say('  A customer weighing a top-up against an upgrade compares it to the best per-credit')
say('  deal on the ladder. Price below that and top-ups eat the upgrade path.')

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 3 — BOTTOM-UP PRICE CONSTRUCTION
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 3 — BOTTOM-UP PRICE CONSTRUCTION')

const GST = M.tax.gst_pct.value / 100
function minViable(channels, band, mode, scenario, targetGM, nWs = 100) {
  const f = fullyLoaded(band, mode, channels, scenario, nWs)
  const netRequired = (f.marginalInr + f.fixedInr + f.supportInr) / (1 - targetGM)
  const grossReceived = netRequired / (1 - mdrEff)
  const displayInclGst = grossReceived * (1 + GST)
  return { netRequired, grossReceived, displayInclGst, cost: f.totalInr }
}

h2('3.1 Minimum viable price by channel count — below this the tier loses money')
say('  Formula: net_required = (marginal_COGS + fixed_alloc + support) / (1 - target_GM)')
say('           gross_received = net_required / (1 - effective_MDR)')
say('           display_price  = gross_received x 1.18   [GST-inclusive presentation]')
say('  At 100 active workspaces, base usage, target GM 75%:')
table(
  [1, 2, 4].map((ch) => {
    const s1 = minViable(ch, 'base', 'is', 'S1_per_connected_account', 0.75)
    const s2 = minViable(ch, 'base', 'is', 'S2_per_active_account', 0.75)
    const s3 = minViable(ch, 'base', 'is', 'S3_per_profile', 0.75)
    return {
      channels: ch,
      'cost S1': rs(s1.cost, 0),
      'min price S1': rs(s1.displayInclGst, 0),
      'cost S2': rs(s2.cost, 0),
      'min price S2': rs(s2.displayInclGst, 0),
      'cost S3': rs(s3.cost, 0),
      'min price S3': rs(s3.displayInclGst, 0),
    }
  }),
)
say('\n  Read the S1 column against the placeholder plan table (Rs499 / Rs1,499 / Rs3,999).')
say('  Under the literal reading of Zernio billing, the placeholder Starter price does not')
say('  cover the cost of the channels it grants. That is not a pricing preference; it is')
say('  arithmetic on the one vendor figure that exists.')

h2('3.2 Worst-case bound — a tier where worst-case COGS exceeds net revenue cannot ship')
say('  Worst case = the entire credit allotment spent on the most expensive action')
say('  available at that tier, at the high token band, with a repair on every call.')
const worstPer = {}
WIRED.forEach((k) => {
  worstPer[k] = actionCost(k, 'is', 'high').worst / M.actions[k].credits
})
table(
  Object.entries(grants).map(([plan, grant]) => {
    const price = { free: 0, starter: 499, growth: 1499, agency: 3999 }[plan]
    const net = (price / (1 + GST)) * (1 - mdrEff)
    // site_generate is the dearest per credit and is gated to sites>0; free cannot reach it
    const reachable = plan === 'free' ? WIRED.filter((k) => k !== 'site_generate') : WIRED
    const dear = Math.max(...reachable.map((k) => worstPer[k]))
    const worstCogs = inr(dear * grant)
    return {
      plan,
      grant: grant,
      'placeholder price': rs(price),
      'net revenue': rs(net, 0),
      'worst-case COGS': rs(worstCogs, 0),
      verdict: worstCogs > net ? 'UNBOUNDED DOWNSIDE' : 'bounded',
    }
  }),
)
say('\n  Every placeholder tier fails this test, free included. The lever is not the price —')
say('  it is that the allotment does not bind (Phase 2.1), so "spend the whole allotment on')
say('  the dearest action" is a scenario the product permits and nothing caps.')

h2('3.3 Fencing — scored on the only dimensions the code can enforce')
table([
  {
    fence: 'channels',
    'tracks value': 'YES - more reach',
    'tracks cost': 'YES - Zernio bills per account',
    enforceable: 'YES (oauth/zernio/start:89-91)',
    gameable: 'no',
    verdict: 'PRIMARY FENCE',
  },
  {
    fence: 'sites',
    'tracks value': 'YES - a website is a distinct job',
    'tracks cost': 'partly - one-off opus call',
    enforceable: 'YES (site-generate.ts:126-134)',
    gameable: 'no',
    verdict: 'SECONDARY FENCE',
  },
  {
    fence: 'seats',
    'tracks value': 'yes',
    'tracks cost': 'weak',
    enforceable: 'NO - no invite path exists',
    gameable: 'n/a',
    verdict: 'unavailable',
  },
  {
    fence: 'loopLevel',
    'tracks value': 'yes',
    'tracks cost': 'yes',
    enforceable: 'NO - feature unbuilt',
    gameable: 'n/a',
    verdict: 'unavailable',
  },
  {
    fence: 'twinSize',
    'tracks value': 'yes',
    'tracks cost': 'yes',
    enforceable: 'NO - feature unbuilt',
    gameable: 'n/a',
    verdict: 'unavailable',
  },
  {
    fence: 'credits',
    'tracks value': 'weak',
    'tracks cost': 'NO - misses Zernio and fixed',
    enforceable: 'yes',
    gameable: 'does not bind',
    verdict: 'NOT A FENCE',
  },
  {
    fence: 'client workspaces',
    'tracks value': 'yes',
    'tracks cost': 'yes',
    enforceable: 'NO - not a PlanLimits key',
    gameable: 'n/a',
    verdict: 'unavailable',
  },
])
say('\n  Two fences exist. Channels is the good one: it tracks willingness to pay AND tracks')
say('  cost one-for-one, which is the rare case where a fence is honest in both directions.')
say(
  `  But only ${Z.channels_that_exist.value} channels exist in code (${Z.channels_that_exist.source}),`,
)
say('  so the channel ladder has a ceiling of 4 and can separate at most three tiers.')

// ── the recommended tier tables ──────────────────────────────────────────────
const STRATEGY = {
  A_price_leader: [
    { id: 'free', name: 'Free', channels: 1, sites: 0, credits: 200, inr: 0, usd: 0 },
    { id: 'solo', name: 'Solo', channels: 2, sites: 1, credits: 1500, inr: 1499, usd: 19 },
    { id: 'business', name: 'Business', channels: 4, sites: 3, credits: 4000, inr: 2999, usd: 39 },
  ],
  B_value_priced: [
    // Zero channels is the design decision that makes a free tier affordable: generation
    // is free, CONNECTING a channel is what costs money and therefore what you pay for.
    { id: 'free', name: 'Free', channels: 0, sites: 0, credits: 200, inr: 0, usd: 0 },
    { id: 'solo', name: 'Solo', channels: 2, sites: 1, credits: 1500, inr: 2499, usd: 29 },
    { id: 'business', name: 'Business', channels: 4, sites: 3, credits: 4000, inr: 4999, usd: 59 },
    { id: 'studio', name: 'Studio', channels: 4, sites: 10, credits: 12000, inr: 9999, usd: 119 },
  ],
}

function tierEconomics(t, scenario, band = 'base', mode = 'is', nWs = 1000) {
  const f = fullyLoaded(band, mode, t.channels, scenario, nWs)
  const gross = t.inr
  const net = gross / (1 + GST)
  // A free tier collects nothing, so it incurs no MDR and no mandate debit fee.
  const afterMdr =
    gross === 0
      ? 0
      : net * (1 - mdrEff) -
        (net >= 1000
          ? PAY.upi_autopay_debit_inr_1000_plus.value
          : PAY.upi_autopay_debit_inr_under_1000.value)
  const gm = gross === 0 ? null : (afterMdr - f.marginalInr) / afterMdr
  const contribution = afterMdr - f.marginalInr - f.fixedInr - f.supportInr
  return {
    net,
    afterMdr,
    cogs: f.marginalInr,
    fixed: f.fixedInr,
    support: f.supportInr,
    gm,
    contribution,
  }
}

h2('3.4 Top-up rate on the recommended ladder — derived, not asserted')
function topUpFloor(tiers) {
  const paid = tiers.filter((t) => t.inr > 0)
  const implied = paid.map((t) => ({
    tier: t.name,
    gross: t.inr / t.credits,
    net: t.inr / (1 + GST) / t.credits,
  }))
  const cheapest = Math.min(...implied.map((x) => x.gross))
  return { implied, cheapest }
}
;[
  ['A', STRATEGY.A_price_leader],
  ['B', STRATEGY.B_value_priced],
].forEach(([label, tiers]) => {
  const { implied, cheapest } = topUpFloor(tiers)
  say(`  Strategy ${label}:`)
  table(
    implied.map((x) => ({
      tier: x.tier,
      'implied Rs/credit (gross)': rs(x.gross, 3),
      'implied Rs/credit (net of GST)': rs(x.net, 3),
    })),
  )
  const floorPrice = Math.ceil(cheapest * 100) / 100
  say(`    Cheapest plan-implied rate: ${rs(cheapest, 3)}/credit. A top-up MUST price above this`)
  say(
    `    or a customer buys credits instead of upgrading. Recommended floor: ${rs(floorPrice + 0.17, 2)}/credit,`,
  )
  say(
    `    e.g. ${rs(Math.round((floorPrice + 0.17) * 500))} for 500 credits — a ~20% premium over the best ladder rate.`,
  )
})

h2('3.5 Tier count and shape — what the fences actually support')
say('  Three paid tiers is convention, not law. Here the fences allow 1 / 2 / 4 channels,')
say('  and sites adds a second axis at 0 / 1 / 3 / 10. That supports THREE paid tiers')
say('  cleanly. A fourth agency tier has no enforceable fence: client workspaces are not a')
say('  PlanLimits key, seats are unenforceable, and channels is already exhausted at 4.')
say('  Strategy B adds a fourth anyway, fenced only on sites, and that is its weak point.')

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 4 — TOP-DOWN VALIDATION
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 4 — TOP-DOWN VALIDATION')

h2('4.1 The competitor band, and the INR gap')
say(
  `  Of nine global tools checked, ${M.market.global_competitors_publishing_inr.value} publish INR pricing.`,
)
say('  What a $29/month plan actually costs an Indian buyer:')
table([
  {
    buyer: 'GST-registered business',
    'landed Rs': rs(M.market.usd29_landed_inr_b2b.value, 0),
    'uplift over spot': '+4.13%',
    why: 'card FX markup 3.5% + 18% GST on the markup; OIDAR GST reclaimable',
  },
  {
    buyer: 'unregistered consumer',
    'landed Rs': rs(M.market.usd29_landed_inr_b2c.value, 0),
    'uplift over spot': '+22.87%',
    why: 'same, plus 18% OIDAR IGST charged by the vendor and NOT reclaimable',
  },
])
say('\n  The INR-native competition is where the real pressure is:')
table([
  {
    tool: 'Zoho Social Standard',
    'Rs/mo': rs(M.market.zoho_social_inr.value.standard),
    buys: '12 channels, 1 brand, 1 user',
    tax: 'ex-GST',
  },
  {
    tool: 'Zoho Social Professional',
    'Rs/mo': rs(M.market.zoho_social_inr.value.professional),
    buys: '12 channels + publishing tools',
    tax: 'ex-GST',
  },
  {
    tool: 'ZocialOne Essential',
    'Rs/mo': rs(M.market.zocialone_inr.value.essential),
    buys: '3 accounts, 600 AI credits',
    tax: '+18% GST',
  },
  {
    tool: 'ZocialOne Professional',
    'Rs/mo': rs(M.market.zocialone_inr.value.professional),
    buys: '10 accounts, 1,500 credits',
    tax: '+18% GST',
  },
  {
    tool: 'PostDesi Pro Creator',
    'Rs/mo': rs(M.market.postdesi_inr.value.pro_creator),
    buys: '100 post credits, 30 images',
    tax: 'not stated',
  },
  { tool: 'Buffer Free', 'Rs/mo': rs(0), buys: '3 channels, 10 posts each', tax: 'n/a' },
])
say('\n  Zoho Social sells TWELVE channels for Rs900. We can enforce at most FOUR and, under')
say(
  '  the literal Zernio reading, four channels cost us ' +
    rs(inr(zernioUsd(4, 'S1_per_connected_account')), 0) +
    '/month to carry.',
)
say('  Zoho is not beatable on channel count at any price we can charge.')

h2('4.2 The real alternative — the employee-and-agency anchor')
table(
  Object.entries(M.anchors_inr_month)
    .filter(([k]) => !k.startsWith('_'))
    .filter(([, v]) => typeof v.value === 'number')
    .map(([k, v]) => ({
      alternative: k,
      'Rs/month': rs(v.value),
      'what it buys': String(v.source).slice(0, 62),
    })),
)
say('\n  The "employee, not a tool" framing is defensible ONLY against the hire rows.')
;[1499, 2499, 2999, 4999].forEach((p) => {
  say(
    `    At ${rs(p)}/month: ${pct(p / M.anchors_inr_month.junior_hire_tier1.value)} of a tier-1 junior hire, ` +
      `${pct(p / M.anchors_inr_month.agency_floor.value)} of the published agency floor, ` +
      `${pct(p / M.anchors_inr_month.diy_standard.value)} of the standard DIY stack.`,
  )
})
say('\n  The agency floor is the uncomfortable comparison, not the salary. Rs7,000 buys 12')
say('  static posts plus 2 reels WITH design across two platforms from a real agency.')
say(
  '  And the demand ceiling is lower than any of it: ' +
    M.anchors_inr_month.msme_digital_marketing_ceiling.value.slice(0, 100) +
    '...',
)

h2('4.3 The RBI e-mandate ceiling — a hard constraint on annual pricing')
say(`  ${M.rbi_emandate.afa_free_ceiling_inr.source}`)
say(
  `  AFA-free ceiling: ${rs(M.rbi_emandate.afa_free_ceiling_inr.value)} per transaction, on cards, PPIs AND UPI alike.`,
)
say('  ' + M.rbi_emandate.afa_free_ceiling_inr.note)
say(
  `  Net of 18% GST that is ${rs(M.rbi_emandate.afa_free_ceiling_inr.value / (1 + GST), 2)} of revenue per auto-debit.`,
)
say('  Software subscriptions do NOT qualify for the Rs1,00,000 enhanced ceiling — the list is')
say('  closed: ' + M.rbi_emandate.enhanced_ceiling_categories.value.join(', ') + '.')
say('')
say('  CONSEQUENCE FOR ANNUAL PLANS:')
;[STRATEGY.A_price_leader, STRATEGY.B_value_priced].forEach((tiers, i) => {
  const label = i === 0 ? 'A' : 'B'
  tiers
    .filter((t) => t.inr > 0)
    .forEach((t) => {
      const annual = t.inr * 10 // "2 months free" convention
      const ok = annual <= M.rbi_emandate.afa_free_ceiling_inr.value
      say(
        `    Strategy ${label} ${t.name}: annual at 10x monthly = ${rs(annual)} -> ${ok ? 'renews AFA-free' : 'EXCEEDS Rs15,000 — card-only or invoice, cannot auto-renew on UPI'}`,
      )
    })
})
say('  Also: every renewal at every price triggers a 24-hour pre-debit notice with an opt-out')
say('  (s.6(a)). That is an involuntary-churn surface at Rs499 just as much as at Rs14,999.')

h2('4.4 GST presentation — inclusive or exclusive')
say('  ' + M.tax.b2c_display_rule.note)
table(
  [1499, 2499, 2999, 4999].map((p) => ({
    headline: rs(p),
    'if INCLUSIVE: net revenue': rs(p / (1 + GST), 2),
    'if EXCLUSIVE: customer pays': rs(p * (1 + GST), 2),
    'revenue given up by inclusive': rs(p - p / (1 + GST), 2) + ' (' + pct(GST / (1 + GST)) + ')',
  })),
)
say('\n  RECOMMENDATION: INCLUSIVE for the INR B2C-facing tiers, EXCLUSIVE for anything sold')
say('  to a GST-registered business. A registered buyer reclaims the 18% as input credit and')
say('  only cares about the net, so exclusive costs them nothing and preserves 15.25% of')
say('  headline revenue. An unregistered sole proprietor cannot reclaim it, and for them a')
say('  clean inclusive round number is worth the 15.25%. The code must capture a GSTIN at')
say('  checkout to make that split — it does not today.')

h2('4.5 India versus global, and the arbitrage question')
say('  Set the dollar price on global purchasing power and the rupee price on Indian')
say('  purchasing power, and let the implied rate be whatever it is:')
;[STRATEGY.A_price_leader, STRATEGY.B_value_priced].forEach((tiers, i) => {
  tiers
    .filter((t) => t.inr > 0)
    .forEach((t) => {
      say(
        `    Strategy ${i === 0 ? 'A' : 'B'} ${t.name}: ${rs(t.inr)} vs $${t.usd} -> implied rate ${r(t.inr / t.usd, 1)} INR/USD (market ${FX})`,
      )
    })
})
say('  ARBITRAGE ENFORCEMENT — what the code can actually support today:')
table([
  {
    mechanism: 'payment instrument',
    'enforceable now': 'YES',
    how: 'Cashfree order path is INR-hardcoded (cashfree/index.ts:120-121); there is no USD path at all',
    leakage: 'nil — the dollar tier does not exist yet',
  },
  {
    mechanism: 'billing country',
    'enforceable now': 'NO',
    how: 'no country field is captured anywhere in the checkout path',
    leakage: 'n/a',
  },
  {
    mechanism: 'GSTIN presence',
    'enforceable now': 'NO',
    how: 'not captured; would also be the natural inclusive/exclusive switch',
    leakage: 'n/a',
  },
  {
    mechanism: 'IP geolocation',
    'enforceable now': 'NO',
    how: 'not implemented; trivially defeated by a VPN in any case',
    leakage: 'high if used alone',
  },
])
say('  The honest position: there is no arbitrage risk today because there is no dollar tier')
say('  and no working checkout. When one is built, the instrument IS the fence — an Indian')
say('  UPI mandate is hard for a US buyer to obtain, which is a stronger control than IP.')

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 5 — THE FORK
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 5 — THE FORK: PRICE LEADER vs VALUE PRICED')

function strategyBlock(name, tiers, scenario) {
  h2(`${name} — tier table and consequences (Zernio ${scenario})`)
  table(
    tiers.map((t) => {
      const e = tierEconomics(t, scenario)
      return {
        tier: t.name,
        'INR incl GST': t.inr ? rs(t.inr) : 'Rs0',
        USD: t.usd ? '$' + t.usd : '$0',
        ch: t.channels,
        sites: t.sites,
        credits: t.credits,
        'net rev': rs(e.afterMdr, 0),
        'marginal COGS': rs(e.cogs, 0),
        'gross margin': e.gm === null ? 'n/a' : pct(e.gm),
        contribution: rs(e.contribution, 0),
      }
    }),
  )
  const annualNote = tiers.filter((t) => t.inr * 10 > 15000).map((t) => t.name)
  say(
    `  Annual at 10x monthly: ${annualNote.length ? annualNote.join(', ') + ' exceed(s) the Rs15,000 RBI AFA ceiling' : 'all tiers renew AFA-free'}.`,
  )
  return tiers
}

;['S1_per_connected_account', 'S2_per_active_account', 'S3_per_profile'].forEach((s) => {
  strategyBlock('STRATEGY A — price leader', STRATEGY.A_price_leader, s)
})
;['S1_per_connected_account', 'S2_per_active_account', 'S3_per_profile'].forEach((s) => {
  strategyBlock('STRATEGY B — value priced', STRATEGY.B_value_priced, s)
})

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 6 — UNIT ECONOMICS
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 6 — UNIT ECONOMICS ON THE RECOMMENDED PRICES')

const MIX = { solo: 0.65, business: 0.3, studio: 0.05 }
function blended(tiers, scenario) {
  let rev = 0,
    contrib = 0,
    w = 0
  tiers
    .filter((t) => t.inr > 0)
    .forEach((t) => {
      const share = MIX[t.id] ?? 0
      const e = tierEconomics(t, scenario)
      rev += share * e.afterMdr
      contrib += share * e.contribution
      w += share
    })
  return { arpu: rev / w, contribution: contrib / w }
}

h2('6.1 Blended ARPU and contribution at a stated plan mix')
say(
  `  Mix assumption (INFERRED): Solo ${pct(MIX.solo, 0)}, Business ${pct(MIX.business, 0)}, Studio ${pct(MIX.studio, 0)}.`,
)
say('  Basis: a self-serve SMB product skews hard to the entry paid tier; no data exists.')
table(
  ['S1_per_connected_account', 'S2_per_active_account', 'S3_per_profile'].map((s) => {
    const a = blended(STRATEGY.A_price_leader, s)
    const b = blended(STRATEGY.B_value_priced, s)
    return {
      'Zernio scenario': s,
      'A ARPU': rs(a.arpu, 0),
      'A contribution': rs(a.contribution, 0),
      'B ARPU': rs(b.arpu, 0),
      'B contribution': rs(b.contribution, 0),
    }
  }),
)

h2('6.2 LTV, maximum affordable CAC, and payback')
say('  LTV = monthly_contribution / monthly_churn      (contribution, not revenue)')
say('  Max affordable CAC = LTV / 3                    (the 3:1 threshold)')
say('  Payback months = CAC / monthly_contribution')
;['S1_per_connected_account', 'S3_per_profile'].forEach((s) => {
  say(`\n  Zernio ${s}:`)
  table(
    M.churn_cac.churn_scenarios_modelled.map((ch) => {
      const a = blended(STRATEGY.A_price_leader, s)
      const b = blended(STRATEGY.B_value_priced, s)
      const ltvA = a.contribution / ch,
        ltvB = b.contribution / ch
      return {
        'monthly churn': pct(ch, 0),
        'A LTV': rs(ltvA, 0),
        'A max CAC (3:1)': rs(ltvA / 3, 0),
        'B LTV': rs(ltvB, 0),
        'B max CAC (3:1)': rs(ltvB / 3, 0),
        'B payback @max CAC':
          b.contribution > 0 ? r(ltvB / 3 / b.contribution, 1) + ' mo' : 'never',
      }
    }),
  )
})
say('\n  MAXIMUM AFFORDABLE CAC IS DERIVED ABOVE, NOT ASSUMED. Now the question that matters:')
say('  does any real acquisition channel fit inside it? India-specific SMB SaaS CAC was NOT')
say('  OBTAINED after six targeted searches; the global SMB SaaS band is $200-$500 =')
say(
  `  ${rs(inr(200))}-${rs(inr(500))}, and the source set states comparable regions run 40-60% lower,`,
)
say(
  `  so an Indian equivalent might be ${rs(inr(200) * 0.5)}-${rs(inr(500) * 0.5)}. Compare that to the max CAC column.`,
)

h2('6.3 The free tier decision')
say('  Cost per signup = the free brand resolve + the free-tier carry until conversion.')
say('  Computed for BOTH free-tier designs, because the channel grant decides the answer:')
say('    1-channel free — the placeholder shape. The workspace carries a Zernio account.')
say('    0-channel free — generation is free, CONNECTING a channel is what you pay for.')
;['S1_per_connected_account', 'S3_per_profile'].forEach((s) => {
  const signup = inr(pdfDoorBase)
  ;[1, 0].forEach((ch) => {
    const carry = fullyLoaded('low', 'is', ch, s, 1000).totalInr
    say(
      `\n  Zernio ${s}, ${ch}-channel free: resolve ${rs(signup, 2)} once, then ${rs(carry, 0)}/month carry.`,
    )
    const maxCac = blended(STRATEGY.B_value_priced, s).contribution / 0.05 / 3
    table(
      [
        ['open free tier (no card)', M.churn_cac.pure_freemium.value, 6],
        ['time-limited trial (14d, no card)', M.churn_cac.free_to_paid_no_card_trial.value, 0.5],
        ['card-required trial (14d)', M.churn_cac.free_to_paid_card_required.value, 0.5],
      ].map(([label, conv, months]) => {
        const cogs = signup + carry * months
        const eff = cogs / conv
        return {
          option: label,
          conv: pct(conv),
          'months carried': months,
          'COGS per signup': rs(cogs, 0),
          'effective CAC per paid customer': rs(eff, 0),
          'vs max affordable CAC':
            eff <= maxCac ? 'AFFORDABLE' : 'exceeds by ' + r(eff / maxCac, 1) + 'x',
        }
      }),
    )
  })
})
say('\n  Every Rs1 of free-tier COGS becomes Rs1/conversion_rate of CAC per paid customer.')
say(
  `  At the ${pct(M.churn_cac.pure_freemium.value)} freemium rate that multiplier is ${r(1 / M.churn_cac.pure_freemium.value, 1)}x.`,
)
say('  Max affordable CAC compared against is Strategy B at 5% monthly churn.')
say('  Conversion figures are GLOBAL benchmarks — no India-specific figure exists.')
say('')
say('  THE CHANNEL GRANT, NOT THE TRIAL SHAPE, IS WHAT DECIDES THIS. A free workspace that')
say('  can connect a channel carries a Zernio account for as long as it exists, and a free')
say('  user has no reason to ever leave. Remove the channel and the same open free tier')
say('  becomes affordable, because what is left is a few rupees of inference.')

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 7 — BREAK-EVEN
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 7 — BREAK-EVEN')

function opexOf(k) {
  const o = M.opex_inr_month[k]
  return Object.entries(o)
    .filter(([kk]) => !['tag', 'basis'].includes(kk))
    .reduce((s, [, v]) => s + (typeof v === 'number' ? v : 0), 0)
}
const OPEX = {
  founders_unpaid: opexOf('founders_unpaid'),
  founders_paid: opexOf('founders_paid'),
  full_market: opexOf('full_market'),
}

h2('7.1 The lean-team monthly opex floor')
table(
  Object.entries(OPEX).map(([k, v]) => ({
    scenario: k,
    'Rs/month': rs(v),
    note: M.opex_inr_month[k].basis.slice(0, 60),
  })),
)
say('  ' + M.opex_inr_month._excluded)

h2('7.2 Paying customers to break even')
say('  customers = monthly_opex / blended_contribution_per_customer')
;['S1_per_connected_account', 'S2_per_active_account', 'S3_per_profile'].forEach((s) => {
  const a = blended(STRATEGY.A_price_leader, s),
    b = blended(STRATEGY.B_value_priced, s)
  table(
    Object.entries(OPEX).map(([k, v]) => ({
      Zernio: s.replace('_per_', ' '),
      'opex scenario': k,
      'opex Rs': rs(v),
      'A contribution': rs(a.contribution, 0),
      'A customers': a.contribution > 0 ? Math.ceil(v / a.contribution) : 'NEVER',
      'B contribution': rs(b.contribution, 0),
      'B customers': b.contribution > 0 ? Math.ceil(v / b.contribution) : 'NEVER',
    })),
  )
})

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 8 — SCALE AND MARGIN RISK
// ═════════════════════════════════════════════════════════════════════════════
h1('PHASE 8 — SCALE AND MARGIN RISK')

h2('8.1 Per-unit cost trajectory')
say('  Fixed platform cost is amortised; Zernio and AI are not. Supabase compute and Clerk')
say('  step at stated thresholds.')
const SCALE = [100, 1000, 10000, 100000]
function fixedAtScale(n) {
  let f = fixedUsd
  if (n >= 1000) f += 60 // Supabase compute step: micro -> medium
  if (n >= 10000) f += 25 + 110 // Clerk Pro after pk_live cutover + compute step to large
  if (n >= 100000) f += 1000 + 900 // Clerk MRU overage past 50k + compute + read replica
  return f
}
table(
  SCALE.map((n) => {
    const fx = fixedAtScale(n)
    const ai = inr(aiCogs('base', 'is'))
    const z1 = inr(zernioUsd(2, 'S1_per_connected_account'))
    const z3 = inr(zernioUsd(2, 'S3_per_profile'))
    return {
      workspaces: n.toLocaleString('en-IN'),
      'fixed total Rs': rs(inr(fx), 0),
      'fixed per ws': rs(inr(fx) / n, 2),
      'AI per ws': rs(ai, 0),
      'Zernio S1 per ws': rs(z1, 0),
      'total S1': rs(inr(fx) / n + ai + z1, 0),
      'total S3': rs(inr(fx) / n + ai + z3, 0),
    }
  }),
)
say('\n  AI falls with routing, caching and batch — but caching delivers 0% today and batch is')
say('  not called at all, so AS-IS it does not fall. Aggregator publishing does not fall at')
say('  all: it is linear in connected accounts by construction. Clerk gets WORSE — it is a')
say('  per-user cost, flat to 50,000 MRU and then rising toward the marginal rate.')

h2('8.2 Scaling levers, ranked by rupees saved per engineering day')
const p = profile('base')
const saveBatch =
  (actionCost('loop_cycle', 'is').expected -
    textCall({ ...M.actions.loop_cycle, cacheable_in: 0 }, 'designed').expected) *
  p.loop_cycle
const saveRoute =
  actionCost('brand_research', 'is').expected -
  textCall({ ...M.actions.brand_research, cacheable_in: 0, batchable: false }, 'designed').expected
const saveCache =
  aiCogs('base', 'is') -
  WIRED.reduce((s, k) => {
    const a = M.actions[k]
    // A per-image meter has no token legs, so no caching lever touches it.
    const cacheOnly = a.flat_usd
      ? a.flat_usd
      : textCall({ ...a, batchable: false, as_designed_model: null }, 'designed').expected
    return s + (p[k] || 0) * cacheOnly
  }, 0)
table([
  {
    lever: 'Renegotiate or replace Zernio',
    'Rs/workspace/month saved': rs(
      inr(zernioUsd(2, 'S1_per_connected_account') - zernioUsd(2, 'S3_per_profile')),
      0,
    ),
    basis: 'S1 -> S3 on 2 channels; the single largest line in the model',
  },
  {
    lever: 'Cut the image attach rate or self-host rendering',
    'Rs/workspace/month saved': rs(inr(p.image_standard * M.actions.image_standard.flat_usd), 2),
    basis: 'images are ' + pct(imgShare) + ' of AI COGS and no lever touches them',
  },
  {
    lever: 'Batch the weekly Loop (-50%, 4h SLA is acceptable for a scheduled job)',
    'Rs/workspace/month saved': rs(inr(saveBatch), 2),
    basis: 'loop_cycle is the one genuinely deferrable action',
  },
  {
    lever: 'Honour the routing decision already recorded for brand_guidelines',
    'Rs/workspace/month saved': rs(inr(saveRoute), 2),
    basis: 'one-off per signup, not recurring; the bake-off already justified it',
  },
  {
    lever: 'Make the cached prefix clear the minimum',
    'Rs/workspace/month saved': rs(inr(saveCache), 2),
    basis: 'requires a prefix >4096 tokens on haiku; currently ~175',
  },
  {
    lever: 'Supabase Storage -> R2 for media egress',
    'Rs/workspace/month saved': 'not quantified',
    basis: 'R2 egress is free vs $0.09/GB; per-attachment byte volumes are unknown',
  },
])
say('\n  The ranking is unambiguous and uncomfortable: the whole Margin Engine sits below the')
say('  vendor negotiation in value, by roughly two orders of magnitude.')

h2('8.3 Named margin killers')
;[
  'A power user on the dearest action inside an allotment that does not bind. The allotment is 7-77x the designed burn, so it is not a cap.',
  'The free first brand resolve: full sonnet call, zero credits, no counter, no rate limit, unbounded by design and documented as such in the code.',
  'inbox_reply and the publish platform write: reachable, spend real vendor budget, charge nothing, and no action key exists for the publish write at all.',
  'A repair billing twice for one output, with a LARGER input the second time because it resends everything.',
  'Free-tier conversion below plan while consuming the onboarding research at ' +
    rs(inr(pdfDoorBase), 2) +
    ' a signup.',
  'A model price rise with no hot repricing path: pricing.config.json is a build-time import, so repricing is a code edit plus a full cold rebuild plus a deploy.',
  'Rupee depreciation at ~' +
    M.fx.annual_depreciation_pct.value +
    '%/yr against USD-denominated vendor costs, with a fixed INR price.',
  'The 18% RCM on foreign vendor spend paid in CASH and locked up ~' +
    M.tax.rcm_lockup_months.base +
    ' months while export revenue produces no output GST to offset it.',
  'Support at the bottom tier: ' +
    rs(supportHigh) +
    '/month at the high band against a contribution that may be smaller than that.',
  'Involuntary churn from the 24-hour pre-debit opt-out notice that RBI requires on every renewal at every price.',
].forEach((s, i) => say(`  ${i + 1}. ${s}`))

// ═════════════════════════════════════════════════════════════════════════════
// HEADLINE
// ═════════════════════════════════════════════════════════════════════════════
console.log('\n' + '='.repeat(78))
console.log('HEADLINE — SAHODA pricing model, wt-web@c8faa34, ' + M._meta.generated)
console.log('='.repeat(78))
const hlA = blended(STRATEGY.A_price_leader, 'S1_per_connected_account')
const hlB = blended(STRATEGY.B_value_priced, 'S1_per_connected_account')
const hlA3 = blended(STRATEGY.A_price_leader, 'S3_per_profile')
const hlB3 = blended(STRATEGY.B_value_priced, 'S3_per_profile')
console.log(`FX ${FX} INR/USD  |  GST ${pct(GST, 0)}  |  effective UPI MDR ${pct(mdrEff, 3)}`)
console.log(
  `AI COGS per active workspace/month   AS-IS ${rs(inr(aiCogs('base', 'is')), 2)}   AS-DESIGNED ${rs(inr(aiCogs('base', 'designed')), 2)}   (engine worth ${pct(1 - aiCogs('base', 'designed') / aiCogs('base', 'is'))})`,
)
console.log(
  `Zernio per workspace/month (2 ch)    S1 ${rs(inr(zernioUsd(2, 'S1_per_connected_account')), 0)}   S2 ${rs(inr(zernioUsd(2, 'S2_per_active_account')), 0)}   S3 ${rs(inr(zernioUsd(2, 'S3_per_profile')), 0)}`,
)
console.log(
  `Credits burned at designed cadence   ${r(burnBase, 0)}/month vs a Starter grant of 1,500 — the grant is ${r(1500 / burnBase, 1)}x the burn`,
)
console.log(
  `Strategy A (price leader)  ARPU ${rs(hlA.arpu, 0)}  contribution ${rs(hlA.contribution, 0)} (S1) / ${rs(hlA3.contribution, 0)} (S3)`,
)
console.log(
  `Strategy B (value priced)  ARPU ${rs(hlB.arpu, 0)}  contribution ${rs(hlB.contribution, 0)} (S1) / ${rs(hlB3.contribution, 0)} (S3)`,
)
console.log(
  `Break-even, founders paid ${rs(OPEX.founders_paid)}/mo:  A ${hlA.contribution > 0 ? Math.ceil(OPEX.founders_paid / hlA.contribution) : 'NEVER'} customers (S1) / ${hlA3.contribution > 0 ? Math.ceil(OPEX.founders_paid / hlA3.contribution) : 'NEVER'} (S3)`,
)
console.log(
  `                                        B ${hlB.contribution > 0 ? Math.ceil(OPEX.founders_paid / hlB.contribution) : 'NEVER'} customers (S1) / ${hlB3.contribution > 0 ? Math.ceil(OPEX.founders_paid / hlB3.contribution) : 'NEVER'} (S3)`,
)
console.log('')
console.log('THE GAP THAT MATTERS, in rupees per month, AS-IS minus AS-DESIGNED on AI COGS:')
SCALE.slice(0, 3).forEach((n) => {
  const gap = (aiCogs('base', 'is') - aiCogs('base', 'designed')) * n
  console.log(`  ${String(n).padStart(6)} active workspaces: ${rs(inr(gap), 0)}/month`)
})
console.log('  That is what finishing the Margin Engine is worth. Compare it to the Zernio line:')
SCALE.slice(0, 3).forEach((n) => {
  const gap = (zernioUsd(2, 'S1_per_connected_account') - zernioUsd(2, 'S3_per_profile')) * n
  console.log(
    `  ${String(n).padStart(6)} active workspaces: ${rs(inr(gap), 0)}/month from a Zernio cap re-reading alone`,
  )
})
console.log('')
console.log('Revenue-side figures are FORECASTS. No workspace has ever resolved to a paid plan,')
console.log('the checkout bridge route does not exist, and site_generate has never executed.')
