import { env } from './env.mjs'

// The local .env ships NEXT_PUBLIC_SUPABASE_URL already carrying `/rest/v1/`.
// supabase-js wants a bare origin, so normalise to the origin and append once.
export const ORIGIN = new URL(env.NEXT_PUBLIC_SUPABASE_URL).origin
export const REST = `${ORIGIN}/rest/v1`
export const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * One PostgREST call. `token` null means the anon key alone (signed out).
 * Returns the status, body and — when `count` is asked for — the exact number
 * the SERVER reported, because "{ok:false}" is what a function says and a row
 * count is what the database did.
 */
export async function rest(path, { token = null, method = 'GET', body, headers = {} } = {}) {
  const h = {
    apikey: ANON,
    Authorization: `Bearer ${token ?? ANON}`,
    Accept: 'application/json',
    ...headers,
  }
  if (body !== undefined) h['Content-Type'] = 'application/json'
  const res = await fetch(`${REST}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = null
  }
  return {
    status: res.status,
    contentRange: res.headers.get('content-range'),
    text,
    json,
    rows: Array.isArray(json) ? json.length : null,
  }
}

/** Exact server-side count via Prefer: count=exact, independent of page size. */
export async function restCount(path, { token = null } = {}) {
  const r = await rest(path, { token, headers: { Prefer: 'count=exact', Range: '0-0' } })
  const cr = r.contentRange || ''
  const total = cr.includes('/') ? cr.split('/')[1] : null
  return { ...r, count: total === '*' || total === null ? null : Number(total) }
}
