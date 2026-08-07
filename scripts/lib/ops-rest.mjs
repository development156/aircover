import { loadEnv } from './ops-env.mjs'

/**
 * Minimal PostgREST client for the ops seed.
 *
 * Deliberately not supabase-js: the repo root has no dependencies and a seed
 * script that needs its own install step is a seed script nobody runs. `fetch`
 * has been global since Node 18.
 *
 * This talks with the service key, which bypasses RLS — legitimate here because
 * seeding platform tables has no user to act as. It is confined to this file and
 * to `scripts/`, never to apps/web.
 */

export class RestError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'RestError'
    this.status = status
  }
}

function headers(extra = {}) {
  const { serviceKey } = loadEnv()
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

export function hasDbCredentials() {
  const { supabaseUrl, serviceKey } = loadEnv()
  return Boolean(supabaseUrl && serviceKey)
}

async function request(path, init) {
  const { supabaseUrl } = loadEnv()
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, init)
  const text = await response.text()
  if (!response.ok) {
    // The body can name columns and constraints. That is fine in a local seed
    // log and never leaves this process.
    throw new RestError(
      `${init.method} ${path} → ${response.status}: ${text.slice(0, 400)}`,
      response.status,
    )
  }
  return text ? JSON.parse(text) : []
}

/** Rows keyed by a real unique column, upserted in one round trip. */
export async function upsert(table, rows, onConflict) {
  if (rows.length === 0) return []
  return request(`${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: 'POST',
    headers: headers({ Prefer: 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(rows),
  })
}

export async function insert(table, rows) {
  if (rows.length === 0) return []
  return request(table, {
    method: 'POST',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(rows),
  })
}

export async function patch(table, query, values) {
  return request(`${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=representation' }),
    body: JSON.stringify(values),
  })
}

export async function select(table, query) {
  return request(`${table}?${query}`, { method: 'GET', headers: headers() })
}

/**
 * Resolve a Clerk user id from an email so a seeded owner is linked immediately
 * rather than waiting for their first sign-in. Returns null for anything less
 * than a confident single match — the user.created webhook links the seat later,
 * and a wrong link would hand someone else the console.
 */
export async function clerkUserIdForEmail(email) {
  const { clerkSecret } = loadEnv()
  if (!clerkSecret) return null
  try {
    const response = await fetch(
      `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}&limit=2`,
      { headers: { Authorization: `Bearer ${clerkSecret}` } },
    )
    if (!response.ok) return null
    const users = await response.json()
    if (!Array.isArray(users) || users.length !== 1) return null
    return typeof users[0]?.id === 'string' ? users[0].id : null
  } catch {
    return null
  }
}
