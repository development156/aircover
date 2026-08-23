import { env } from '../lib/env.mjs'
const has = (k) => (env[k] ? `set (len ${env[k].length})` : 'ABSENT')
console.log('UPSTASH_REDIS_REST_URL  ', has('UPSTASH_REDIS_REST_URL'))
console.log('UPSTASH_REDIS_REST_TOKEN', has('UPSTASH_REDIS_REST_TOKEN'))
console.log('TURNSTILE_SECRET_KEY    ', has('TURNSTILE_SECRET_KEY'))
console.log('CRON_SECRET             ', has('CRON_SECRET'))
if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  const key = `sahoda:rl:audit-probe:${Math.floor(Date.now() / 60000)}`
  const res = await fetch(`${env.UPSTASH_REDIS_REST_URL.replace(/\/$/, '')}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([
      ['INCR', key],
      ['EXPIRE', key, 120],
    ]),
  })
  console.log(
    '\nlive Upstash reachability:',
    res.status,
    res.ok ? '— the limiter can actually measure' : '— FAILS OPEN',
  )
} else {
  console.log('\n⚠ the limiter returns ALLOW_UNMEASURED on every call: nothing is rate limited')
}
