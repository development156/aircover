#!/usr/bin/env node
/**
 * The Zernio dry-run validator, asked every question docs/31 left open.
 *
 * ── WHY THIS IS A SCRIPT IN THE REPO AND NOT A TEST ──────────────────────────
 * It talks to a live vendor over the network with a real API key. A test that
 * does that is a test that fails when the office wifi drops, so the gate must
 * never run it. But the answers it produced are load-bearing — six Constraint
 * Engine bounds and two `[OPEN]` questions were settled by this output — and a
 * finding nobody can reproduce is a finding that rots. So it lives here, runnable
 * by hand, and docs/32 records what it said and when.
 *
 *   node scripts/zernio/validate-probe.mjs            # human-readable
 *   node scripts/zernio/validate-probe.mjs --json      # the raw log
 *
 * ── THE CONTROL IS NOT OPTIONAL ──────────────────────────────────────────────
 * `POST /v1/tools/validate/post` answers `valid: true` for a platform name it
 * does not recognise, and for media it never fetched. Both were MEASURED
 * (2026-08-20). So a bare `valid: true` is NOT evidence that anything was
 * checked, and every case below that expects a pass is paired with a control
 * that must FAIL. A probe whose refusal case does not go red proves nothing, and
 * this file says so out loud rather than trusting the green.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const BASE = 'https://zernio.com/api/v1'
/** media.zernio.com is behind Cloudflare's browser check; a bot UA gets 403/1010. */
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'
const ACC = '0123456789abcdef01234567'

function apiKey() {
  for (const rel of ['.env', 'apps/web/.env']) {
    const p = path.join(ROOT, rel)
    if (!fs.existsSync(p)) continue
    const m = fs.readFileSync(p, 'utf8').match(/^ZERNIO_API_KEY=(.*)$/m)
    if (m) return m[1].trim().replace(/^["']|["']$/g, '')
  }
  throw new Error('ZERNIO_API_KEY not found in .env or apps/web/.env')
}

const KEY = apiKey()
const log = []

async function validate(body) {
  const res = await fetch(`${BASE}/tools/validate/post`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${KEY}`,
      'User-Agent': UA,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const ct = res.headers.get('content-type') ?? ''
  const text = await res.text()
  const json = ct.includes('application/json') ? JSON.parse(text) : null
  return { status: res.status, json }
}

/** A placeholder image at exactly these pixel dimensions. Verified by reading the PNG IHDR. */
const img = (w, h) => `https://placehold.co/${w}x${h}.png`
const DEAD = 'https://placehold.co/this-path-does-not-exist-404.png'

const post = (platform, { psd, content = 'hello there', mediaItems } = {}) => ({
  content,
  ...(mediaItems ? { mediaItems } : {}),
  platforms: [{ platform, accountId: ACC, ...(psd ? { platformSpecificData: psd } : {}) }],
})

async function ask(group, label, body, expect) {
  const { status, json } = await validate(body)
  const valid = json?.valid
  const messages = [
    ...(json?.errors ?? []).map((e) => `ERROR[${e.platform}] ${e.error}`),
    ...(json?.warnings ?? []).map((w) => `WARN[${w.platform}] ${w.warning}`),
  ]
  const agreed = expect === undefined || expect === valid
  log.push({ group, label, status, valid, expect, agreed, messages })
  return json
}

async function main() {
  // ── 1. WHICH PLATFORM NAMES ARE ACTUALLY CHECKED ──────────────────────────
  // The control IS the case: a body longer than any platform's limit is refused by
  // every name the validator knows, so a `valid: true` here means the entry was
  // skipped whole.
  //
  // ── AND THE LENGTH IS LOAD-BEARING, WHICH THE FIRST RUN OF THIS PROVED ──────
  // The first probe used 40,000 characters and reported `reddit`, `facebook` and
  // `slack` as SKIPPED. They are not. Reddit's limit is exactly 40,000, so the
  // control sat precisely ON the boundary and returned a warning rather than an
  // error; Facebook's is 63,206 and Slack's 40,000. A control that does not
  // exceed the bound it is testing proves the opposite of what it looks like it
  // proves. 200,000 is past every limit the validator knows.
  for (const name of [
    'twitter',
    'x',
    'X',
    'Twitter',
    'instagram',
    'linkedin',
    'googlebusiness',
    'gbp',
    'google_business',
    'facebook',
    'tiktok',
    'threads',
    'bluesky',
    'reddit',
    'pinterest',
    'telegram',
    'snapchat',
    'discord',
    'slack',
    'youtube',
    'notaplatform',
  ]) {
    await ask('platform-names', `${name} · 200k body`, post(name, { content: 'x'.repeat(200000) }))
  }

  // ── 2. IS MEDIA FETCHED? A DEAD URL MUST ERROR, OR SILENCE MEANS NOTHING ──
  for (const p of ['instagram', 'linkedin', 'googlebusiness', 'twitter', 'pinterest']) {
    await ask(
      'media-fetched',
      `${p} · 404 image url`,
      post(p, {
        mediaItems: [{ type: 'image', url: DEAD, mimeType: 'image/png' }],
      }),
    )
  }

  // ── 3. CHARACTER LIMITS, AT THE BOUNDARY ─────────────────────────────────
  for (const [platform, limit] of [
    ['twitter', 280],
    ['instagram', 2200],
    ['linkedin', 3000],
    ['googlebusiness', 1500],
  ]) {
    const media =
      platform === 'instagram'
        ? [{ type: 'image', url: img(600, 600), mimeType: 'image/png' }]
        : undefined
    await ask(
      'max-chars',
      `${platform} · exactly ${limit}`,
      post(platform, { content: 'y'.repeat(limit), mediaItems: media }),
      true,
    )
    await ask(
      'max-chars',
      `${platform} · ${limit + 1}`,
      post(platform, { content: 'y'.repeat(limit + 1), mediaItems: media }),
      false,
    )
  }

  // ── 4. INSTAGRAM ASPECT, AT THE BOUNDARY — the one media rule it enforces ─
  for (const [w, h, expect] of [
    [750, 1000, true],
    [749, 1000, false],
    [1910, 1000, true],
    [1911, 1000, false],
    [1000, 1000, true],
    [1080, 1920, false],
  ]) {
    await ask(
      'ig-aspect-feed',
      `${w}×${h} (${(w / h).toFixed(4)})`,
      post('instagram', {
        mediaItems: [{ type: 'image', url: img(w, h), mimeType: 'image/png' }],
      }),
      expect,
    )
  }
  // The same photos, declared a Story. docs/31 §7 item 5.
  for (const [w, h] of [
    [1080, 1920],
    [1000, 1000],
    [1910, 1000],
  ]) {
    await ask(
      'ig-aspect-story',
      `${w}×${h} as story`,
      post('instagram', {
        psd: { contentType: 'story' },
        mediaItems: [{ type: 'image', url: img(w, h), mimeType: 'image/png' }],
      }),
      true,
    )
  }

  // ── 5. MEDIA COUNT — claimed by the guides, enforced by nobody ────────────
  const many = (n) =>
    Array.from({ length: n }, () => ({ type: 'image', url: img(600, 600), mimeType: 'image/png' }))
  for (const [p, n] of [
    ['linkedin', 21],
    ['twitter', 5],
    ['instagram', 11],
    ['googlebusiness', 2],
  ]) {
    await ask('media-count', `${p} × ${n} images`, post(p, { mediaItems: many(n) }))
  }

  // ── 6. X THREADS — P3's instrument ───────────────────────────────────────
  const thread = (items, content) =>
    post('twitter', { psd: { threadItems: items }, ...(content ? { content } : {}) })
  await ask(
    'x-thread',
    '3 short segments',
    thread([{ content: 'one' }, { content: 'two' }, { content: 'three' }]),
    true,
  )
  await ask(
    'x-thread',
    'segment of 400 chars',
    thread([{ content: 'one' }, { content: 'y'.repeat(400) }]),
    true,
  )
  await ask(
    'x-thread',
    'ROOT of 400 chars, segments legal',
    thread([{ content: 'a' }, { content: 'b' }], 'z'.repeat(400)),
    false,
  )
  await ask(
    'x-thread',
    'segment with empty content',
    thread([{ content: '' }, { content: 'b' }]),
    false,
  )
  await ask(
    'x-thread',
    'segment mediaItems, live url',
    thread([
      { content: 'a', mediaItems: [{ type: 'image', url: img(600, 600), mimeType: 'image/png' }] },
    ]),
    true,
  )
  await ask(
    'x-thread',
    'segment mediaItems, DEAD url',
    thread([{ content: 'a', mediaItems: [{ type: 'image', url: DEAD, mimeType: 'image/png' }] }]),
    true,
  )

  // ── 7. POLLS — the one platformSpecificData block it fully enforces ──────
  const xpoll = (poll, mediaItems) => post('twitter', { psd: { poll }, mediaItems })
  await ask(
    'x-poll',
    '2 options, 60 min',
    xpoll({ options: ['a', 'b'], duration_minutes: 60 }),
    true,
  )
  await ask('x-poll', '1 option', xpoll({ options: ['a'], duration_minutes: 60 }), false)
  await ask(
    'x-poll',
    '5 options',
    xpoll({ options: ['a', 'b', 'c', 'd', 'e'], duration_minutes: 60 }),
    false,
  )
  await ask(
    'x-poll',
    'option of 26 chars',
    xpoll({ options: ['z'.repeat(26), 'b'], duration_minutes: 60 }),
    false,
  )
  await ask(
    'x-poll',
    'option of 25 chars',
    xpoll({ options: ['z'.repeat(25), 'b'], duration_minutes: 60 }),
    true,
  )
  await ask('x-poll', 'duration 4 min', xpoll({ options: ['a', 'b'], duration_minutes: 4 }), false)
  await ask('x-poll', 'duration 5 min', xpoll({ options: ['a', 'b'], duration_minutes: 5 }), true)
  await ask(
    'x-poll',
    'duration 10080 min',
    xpoll({ options: ['a', 'b'], duration_minutes: 10080 }),
    true,
  )
  await ask(
    'x-poll',
    'duration 10081 min',
    xpoll({ options: ['a', 'b'], duration_minutes: 10081 }),
    false,
  )
  await ask(
    'x-poll',
    'poll + root media',
    xpoll({ options: ['a', 'b'], duration_minutes: 60 }, [
      { type: 'image', url: img(600, 600), mimeType: 'image/png' },
    ]),
    false,
  )
  await ask(
    'x-poll',
    'poll + thread',
    post('twitter', {
      psd: { poll: { options: ['a', 'b'], duration_minutes: 60 }, threadItems: [{ content: 'a' }] },
    }),
    false,
  )

  const lpoll = (poll, mediaItems) => post('linkedin', { psd: { poll }, mediaItems })
  await ask(
    'li-poll',
    'question + 2 options + THREE_DAYS',
    lpoll({ question: 'Which?', options: ['a', 'b'], duration: 'THREE_DAYS' }),
    true,
  )
  await ask(
    'li-poll',
    '5 options',
    lpoll({ question: 'Q', options: ['a', 'b', 'c', 'd', 'e'], duration: 'THREE_DAYS' }),
    false,
  )
  await ask(
    'li-poll',
    'question of 141',
    lpoll({ question: 'q'.repeat(141), options: ['a', 'b'], duration: 'THREE_DAYS' }),
    false,
  )
  await ask(
    'li-poll',
    'question of 140',
    lpoll({ question: 'q'.repeat(140), options: ['a', 'b'], duration: 'THREE_DAYS' }),
    true,
  )
  await ask(
    'li-poll',
    'duration TWO_YEARS',
    lpoll({ question: 'Q', options: ['a', 'b'], duration: 'TWO_YEARS' }),
    false,
  )
  await ask(
    'li-poll',
    'poll + media',
    lpoll({ question: 'Q', options: ['a', 'b'], duration: 'ONE_DAY' }, [
      { type: 'image', url: img(600, 600), mimeType: 'image/png' },
    ]),
    false,
  )

  // ── 8. GOOGLE BUSINESS — every field, and none of them checked ───────────
  await ask(
    'gbp-psd',
    'callToAction type+url',
    post('googlebusiness', {
      psd: { callToAction: { type: 'ORDER', url: 'https://example.com' } },
    }),
  )
  await ask(
    'gbp-psd',
    'callToAction, NO url',
    post('googlebusiness', { psd: { callToAction: { type: 'ORDER' } } }),
  )
  await ask(
    'gbp-psd',
    'callToAction bogus type',
    post('googlebusiness', {
      psd: { callToAction: { type: 'NOT_A_BUTTON', url: 'https://example.com' } },
    }),
  )
  await ask(
    'gbp-psd',
    'topicType EVENT, no event object',
    post('googlebusiness', { psd: { topicType: 'EVENT' } }),
  )
  await ask('gbp-psd', 'topicType BANANA', post('googlebusiness', { psd: { topicType: 'BANANA' } }))
  await ask(
    'gbp-psd',
    'EVENT + title + schedule',
    post('googlebusiness', {
      psd: {
        topicType: 'EVENT',
        event: { title: 'Sale', schedule: { startDate: { year: 2026, month: 9, day: 1 } } },
      },
    }),
  )
  await ask(
    'gbp-psd',
    'OFFER + coupon',
    post('googlebusiness', { psd: { topicType: 'OFFER', offer: { couponCode: 'SAVE10' } } }),
  )

  // ── 9. THE REST OF THE UNREACHED CONTROLS ───────────────────────────────
  const igMedia = [{ type: 'image', url: img(600, 600), mimeType: 'image/png' }]
  await ask(
    'extras',
    'ig collaborators × 4 (doc says ≤3)',
    post('instagram', { psd: { collaborators: ['a', 'b', 'c', 'd'] }, mediaItems: igMedia }),
  )
  await ask(
    'extras',
    'ig firstComment',
    post('instagram', { psd: { firstComment: '#tags' }, mediaItems: igMedia }),
  )
  await ask(
    'extras',
    'ig isAiGenerated',
    post('instagram', { psd: { isAiGenerated: true }, mediaItems: igMedia }),
  )
  await ask('extras', 'x madeWithAi', post('twitter', { psd: { madeWithAi: true } }))
  await ask(
    'extras',
    'li documentTitle + pdf',
    post('linkedin', {
      psd: { documentTitle: 'Deck' },
      mediaItems: [
        { type: 'document', url: 'https://example.com/a.pdf', mimeType: 'application/pdf' },
      ],
    }),
  )

  // ── 10. OUR OWN BUILDER'S OUTPUT, PUT BACK TO THE VENDOR ─────────────────
  // Every object below is EXACTLY what `buildPlatformData` emits, copied from the
  // assertions in `platform-data.test.ts`. This is the strongest check available
  // short of publishing: not "does our shape look right" but "does Zernio accept
  // the bytes we would send".
  //
  // The controls immediately after are not optional. `valid: true` on a Google
  // payload means NOTHING — §8 measured that Zernio validates none of it — so the
  // poll cases carry deliberately-broken twins that must go red, and the Google
  // ones carry the honest caveat instead of a control that cannot exist.
  const igMediaOk = [{ type: 'image', url: img(1080, 1080), mimeType: 'image/png' }]
  const ours = [
    ['x poll', 'twitter', { poll: { options: ['Chai', 'Coffee'], duration_minutes: 1440 } }],
    [
      'linkedin poll',
      'linkedin',
      { poll: { question: 'Chai or coffee?', options: ['Chai', 'Coffee'], duration: 'ONE_DAY' } },
    ],
    [
      'gbp event (UNCHECKED by them)',
      'googlebusiness',
      {
        topicType: 'EVENT',
        event: {
          title: 'Diwali sale',
          schedule: {
            startDate: { year: 2026, month: 11, day: 1 },
            endDate: { year: 2026, month: 11, day: 5 },
          },
        },
      },
    ],
    [
      'gbp offer + cta (UNCHECKED)',
      'googlebusiness',
      {
        callToAction: { type: 'ORDER', url: 'https://chai.example/order' },
        topicType: 'OFFER',
        offer: { couponCode: 'SAVE10' },
      },
    ],
    [
      'ig extras',
      'instagram',
      { firstComment: '#chai #pune', collaborators: ['friend', 'other'], isAiGenerated: true },
    ],
    ['ig story + firstComment', 'instagram', { contentType: 'story', firstComment: '#chai' }],
    ['x madeWithAi', 'twitter', { madeWithAi: true }],
    [
      'x thread + ai',
      'twitter',
      { madeWithAi: true, threadItems: [{ content: 'one' }, { content: 'two' }] },
    ],
  ]
  for (const [label, platform, psd] of ours) {
    await ask(
      'our-payloads',
      label,
      post(platform, {
        psd,
        content: 'Fresh chai from nine.',
        ...(platform === 'instagram' ? { mediaItems: igMediaOk } : {}),
      }),
      true,
    )
  }
  // The controls: the same builder output with ONE bound broken. If these pass,
  // the group above proved nothing about polls either.
  const broken = [
    [
      'CONTROL x poll, 5 options',
      'twitter',
      { poll: { options: ['a', 'b', 'c', 'd', 'e'], duration_minutes: 1440 } },
    ],
    [
      'CONTROL x poll, 4 minutes',
      'twitter',
      { poll: { options: ['a', 'b'], duration_minutes: 4 } },
    ],
    [
      'CONTROL li poll, 141-char question',
      'linkedin',
      { poll: { question: 'q'.repeat(141), options: ['a', 'b'], duration: 'ONE_DAY' } },
    ],
  ]
  for (const [label, platform, psd] of broken) {
    await ask('our-payloads', label, post(platform, { psd }), false)
  }

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(log, null, 2))
    return
  }

  let group = ''
  let disagreements = 0
  for (const row of log) {
    if (row.group !== group) {
      group = row.group
      console.log(`\n── ${group} ──`)
    }
    const mark = row.expect === undefined ? ' ' : row.agreed ? '✓' : '✗'
    if (row.expect !== undefined && !row.agreed) disagreements += 1
    console.log(
      `  ${mark} ${row.label.padEnd(36)} valid=${String(row.valid).padEnd(5)}` +
        (row.messages.length ? `\n      ${row.messages.join('\n      ')}` : ''),
    )
  }
  console.log(
    `\n${log.length} cases. ${disagreements} disagreed with what this file expected.` +
      (disagreements
        ? '  ← Zernio changed, or the expectation was wrong. Read before trusting docs/32.'
        : ''),
  )
}

main().catch((e) => {
  console.error(e)
  process.exitCode = 1
})
