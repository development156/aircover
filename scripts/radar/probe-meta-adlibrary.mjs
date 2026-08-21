/**
 * Does Meta's Ad Library API cover commercial ads in India?
 *
 * Meta's own reference page for `ads_archive` says, verbatim:
 *
 *   "Ads that did not reach any location in the EU will only return if they are
 *    about social issues, elections or politics."
 *
 * That is primary-source and decisive. This script exists to find out something
 * the documentation does NOT say: what an Indian commercial-ads query actually
 * LOOKS like when it comes back. A refusal would be safe. A successful, empty
 * answer would be dangerous — it is indistinguishable from "this competitor runs
 * no ads" unless somebody wrote down that it is not.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const env = {}
for (const name of ['.env', 'apps/web/.env']) {
  let txt
  try {
    txt = readFileSync(resolve(ROOT, name), 'utf8')
  } catch {
    continue
  }
  for (const line of txt.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

const token = env.META_APP_ID ?? ''
console.log(`META_APP_ID present: ${token ? 'yes' : 'no'} (length ${token.length})`)
console.log(`shape: ${/^\d+$/.test(token) ? 'numeric — an app id, not a token' : 'not numeric'}`)

const base = 'https://graph.facebook.com/v21.0/ads_archive'
const query = (country, adType) =>
  `${base}?ad_reached_countries=["${country}"]&ad_type=${adType}` +
  `&search_terms=coffee&fields=id,ad_delivery_start_time&limit=5&access_token=${token}`

for (const [country, adType] of [
  ['IN', 'ALL'],
  ['IN', 'POLITICAL_AND_ISSUE_ADS'],
  ['DE', 'ALL'],
]) {
  const res = await fetch(query(country, adType))
  const body = await res.text()
  let parsed
  try {
    parsed = JSON.parse(body)
  } catch {
    parsed = null
  }
  const shape = parsed?.error
    ? `error ${parsed.error.code}/${parsed.error.error_subcode ?? '-'}: ${parsed.error.message.slice(0, 110)}`
    : `data length ${parsed?.data?.length ?? '?'}`
  console.log(`\n${country} · ad_type=${adType}`)
  console.log(`  http ${res.status}   ${shape}`)
}
