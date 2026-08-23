/**
 * A value that is IDENTICAL to the one in `.env.example` is a placeholder, not a
 * credential — and reporting it as a leak is the false positive that makes a
 * secrets report unreadable. Classify before reporting. Values are never printed.
 */
import fs from 'node:fs'
import path from 'node:path'

import { env, WT } from '../lib/env.mjs'

function parse(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const raw of fs.readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    out[line.slice(0, eq).trim()] = v
  }
  return out
}

const example = parse(path.join(WT, '.env.example'))
const NAMES = [
  'SUPABASE_PROJECT_REF',
  'GOOGLE_GEMINI_API_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_STARTER_PRICE_ID',
  'RAZORPAY_KEY_ID',
  'X_CLIENT_ID',
  'LINKEDIN_CLIENT_ID',
  'META_APP_ID',
]
for (const name of NAMES) {
  const live = env[name]
  const placeholder = example[name]
  const same = live !== undefined && live === placeholder
  console.log(
    `${name.padEnd(26)} len=${String(live?.length ?? 0).padStart(3)}  ` +
      `same-as-.env.example=${same ? 'YES → placeholder' : 'no  → REAL VALUE IS COMMITTED'}`,
  )
}
