#!/usr/bin/env node
/**
 * P3 — every public endpoint, probed LIVE against the deployed app.
 *
 * Every request here is deliberately UNSIGNED or UNAUTHORISED, so the only
 * correct outcome is a refusal; nothing here carries a payload that could be
 * acted on if a check were missing. And because "the handler said no" and "the
 * database stayed put" are different facts, the webhook-event tables are counted
 * PRIVILEGED before and after.
 *
 * A missing signature and a WRONG signature are probed separately: a handler can
 * reject the absent header and still accept a forged one.
 */
import { countPrivileged } from '../lib/db.mjs'
import { env } from '../lib/env.mjs'

const BASE = (env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '')
if (!BASE) throw new Error('NEXT_PUBLIC_APP_URL is not set')
console.log('target:', BASE, '\n')

const before = {
  billing_webhook_events: await countPrivileged('billing_webhook_events'),
  ops_beta_applications: await countPrivileged('ops_beta_applications'),
  users_profile: await countPrivileged('users_profile'),
  workspaces: await countPrivileged('workspaces'),
}
console.log('privileged row counts BEFORE:', JSON.stringify(before), '\n')

const FORGED = 'v1,' + Buffer.from('not-a-real-signature').toString('base64')

const probes = [
  [
    'GET  /embed/beta                      (public by design)',
    'GET',
    '/embed/beta',
    null,
    null,
    'expect 200',
  ],
  [
    'GET  /design-system                   (public by design)',
    'GET',
    '/design-system',
    null,
    null,
    'expect 200',
  ],
  [
    'GET  /api/cron/sweeps                 no authorization',
    'GET',
    '/api/cron/sweeps',
    null,
    null,
    'expect 401',
  ],
  [
    'GET  /api/cron/metrics                no authorization',
    'GET',
    '/api/cron/metrics',
    null,
    null,
    'expect 401',
  ],
  [
    'GET  /api/cron/loop                   no authorization',
    'GET',
    '/api/cron/loop',
    null,
    null,
    'expect 401',
  ],
  [
    'GET  /api/cron/loop                   WRONG bearer',
    'GET',
    '/api/cron/loop',
    null,
    { authorization: 'Bearer wrong-secret-value' },
    'expect 401',
  ],
  [
    'GET  /api/cron/loop                   bare secret, no scheme',
    'GET',
    '/api/cron/loop',
    null,
    { authorization: 'wrong-secret-value' },
    'expect 401',
  ],
  [
    'POST /api/webhooks/cashfree           NO signature',
    'POST',
    '/api/webhooks/cashfree',
    { type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} },
    null,
    'expect 4xx',
  ],
  [
    'POST /api/webhooks/cashfree           FORGED signature',
    'POST',
    '/api/webhooks/cashfree',
    { type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} },
    {
      'x-webhook-signature': 'ZmFrZQ==',
      'x-webhook-timestamp': String(Math.floor(Date.now() / 1000)),
    },
    'expect 4xx',
  ],
  [
    'POST /api/webhooks/clerk              NO signature',
    'POST',
    '/api/webhooks/clerk',
    { type: 'user.created', data: { id: 'user_audit' } },
    null,
    'expect 4xx',
  ],
  [
    'POST /api/webhooks/clerk              FORGED signature',
    'POST',
    '/api/webhooks/clerk',
    { type: 'user.created', data: { id: 'user_audit' } },
    {
      'svix-id': 'msg_audit',
      'svix-timestamp': String(Math.floor(Date.now() / 1000)),
      'svix-signature': FORGED,
    },
    'expect 4xx',
  ],
  [
    'POST /api/public/beta-apply           no turnstile token',
    'POST',
    '/api/public/beta-apply',
    { name: 'audit', business_name: 'audit', email: 'audit@example.invalid' },
    null,
    'expect 4xx',
  ],
  [
    'POST /api/admin/devops/ingest         no bearer',
    'POST',
    '/api/admin/devops/ingest',
    { events: [] },
    null,
    'expect 401',
  ],
  [
    'POST /api/admin/devops/ingest         WRONG bearer',
    'POST',
    '/api/admin/devops/ingest',
    { events: [] },
    { authorization: 'Bearer nope' },
    'expect 401',
  ],
  [
    'GET  /api/admin/devops/ingest         wrong method',
    'GET',
    '/api/admin/devops/ingest',
    null,
    null,
    'expect 405',
  ],
  [
    'GET  /admin                           anonymous',
    'GET',
    '/admin',
    null,
    null,
    'expect 404 or redirect',
  ],
  [
    'GET  /home                            anonymous',
    'GET',
    '/home',
    null,
    null,
    'expect redirect to sign-in',
  ],
]

for (const [label, method, path, body, headers, expectation] of probes) {
  const h = { accept: 'application/json', ...(headers ?? {}) }
  if (body) h['content-type'] = 'application/json'
  let res, text
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: h,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(20000),
    })
    text = (await res.text()).replace(/\s+/g, ' ').slice(0, 110)
  } catch (e) {
    console.log(`ERR   ${label}  -> ${e.name}: ${e.message}`)
    continue
  }
  const loc = res.headers.get('location')
  console.log(
    `${String(res.status).padEnd(4)} ${label}   [${expectation}]${loc ? `  -> ${loc.slice(0, 60)}` : ''}`,
  )
  if (text && res.status !== 200) console.log(`      body: ${text}`)
}

const after = {
  billing_webhook_events: await countPrivileged('billing_webhook_events'),
  ops_beta_applications: await countPrivileged('ops_beta_applications'),
  users_profile: await countPrivileged('users_profile'),
  workspaces: await countPrivileged('workspaces'),
}
console.log('\nprivileged row counts AFTER :', JSON.stringify(after))
const moved = Object.keys(before).filter((k) => before[k] !== after[k])
console.log(
  moved.length
    ? `!! MOVED: ${moved.map((k) => `${k} ${before[k]}->${after[k]}`).join(', ')}`
    : 'nothing landed: every unsigned request was refused at the data layer too.',
)
