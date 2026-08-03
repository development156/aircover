import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Dependency-free env loading for the ops scripts.
 *
 * The repo root has no `dotenv` dependency and these scripts must run from a
 * bare `node scripts/…` with nothing installed, so this is the hand-rolled
 * loader from playwright.config.ts rather than a new package. Existing
 * `process.env` always wins, so CI and Vercel secrets are never shadowed by a
 * stale local file.
 */

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * A value that is still a placeholder is NOT configured.
 *
 * `.env` currently carries `DEVOPS_INGEST_TOKEN=<the string from 2a>`. Treating
 * that as a real token would mean signing ingest requests with a literal angle
 * bracket string and reporting success — the exact fake-success this project
 * refuses. Anything wrapped in angle brackets, or obviously a fill-me-in, reads
 * as absent.
 */
function isPlaceholder(value) {
  const v = value.trim()
  if (v === '') return true
  if (/^<.*>$/.test(v)) return true
  return /^(changeme|your[-_ ]?\w+|todo|tbd|xxx+)$/i.test(v)
}

let cache = null

export function loadEnv() {
  if (cache) return cache

  const parsed = {}

  function loadFile(path) {
    let raw
    try {
      raw = readFileSync(path, 'utf8')
    } catch {
      // Absent is fine — a cloud sandbox supplies the environment directly.
      return
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (trimmed === '' || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq < 1) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      parsed[key] = value
    }
  }

  loadFile(resolve(REPO_ROOT, '.env'))

  /**
   * Per-WORKTREE overrides, loaded second so they win over the shared `.env`.
   *
   * Every worktree symlinks the one root `.env`, but they do not all run on one
   * port: three dev servers were live at once here, and the sync script POSTed
   * its board updates at :3000 — a *different* worktree, which returned a clean
   * 404 because it has no ingest route. Nothing failed loudly; the board simply
   * stopped moving. `ops/.local.env` is gitignored and holds exactly the things
   * that are true of this checkout and no other (`OPS_INGEST_URL`).
   */
  loadFile(resolve(REPO_ROOT, 'ops/.local.env'))

  const read = (key) => {
    const value = process.env[key] ?? parsed[key] ?? ''
    return isPlaceholder(value) ? '' : value
  }

  cache = {
    repoRoot: REPO_ROOT,
    supabaseUrl: (() => {
      const raw = read('NEXT_PUBLIC_SUPABASE_URL') || read('SUPABASE_URL')
      try {
        return new URL(raw).origin
      } catch {
        return raw
      }
    })(),
    serviceKey: read('SUPABASE_SERVICE_ROLE_KEY'),
    clerkSecret: read('CLERK_SECRET_KEY'),
    bootstrapEmails: read('ADMIN_BOOTSTRAP_EMAILS')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
    ingestToken: read('DEVOPS_INGEST_TOKEN'),
    ...resolveIngestUrl(read('OPS_INGEST_URL')),
  }
  return cache
}

/**
 * Where the board is published. The deployed console.
 *
 * Hardcoded rather than read from NEXT_PUBLIC_APP_URL, which `.env.example`
 * ships as `http://localhost:3000` — a "production default" that resolves to a
 * laptop on any fresh checkout would be the same silence this card is about,
 * one layer along.
 */
export const PRODUCTION_INGEST_URL = 'https://app.sahodalabs.com'

/**
 * THE DEFAULT TARGET IS PRODUCTION. Reversed 2026-08-01 (SL-061 Tier 2).
 *
 * ── THIS REVERSES AN EARLIER, DELIBERATE DECISION. READ BEFORE CHANGING IT ──
 * The default used to be `http://localhost:3000`, and that was not an oversight:
 * an earlier build fell back to NEXT_PUBLIC_APP_URL, so a PostToolUse hook on a
 * developer's laptop POSTed local board state straight to production. Defaulting
 * to localhost was the fix, and the reasoning — "syncing to prod has to be
 * something someone typed on purpose" — was sound.
 *
 * It also produced the failure that replaced it. With localhost as the default,
 * a sync with no dev server running queued the update, printed "will replay on
 * the next sync", and EXITED SUCCESSFULLY. That promise is only kept if a sync
 * ever runs. For 30 hours none did, and the deployed board sat 30 hours behind
 * showing 49 cards when the repo held 60, with nothing on the page saying so.
 *
 * Both defaults are wrong in one direction each. The judgement recorded on the
 * card is that a board nobody can trust is worse than an early publish of state
 * that is, in any case, committed to the repository and reviewed like code —
 * and that the earlier hazard is better addressed by being LOUD than by aiming
 * somewhere harmless. So:
 *
 *   · unset            → production. The board publishes by default.
 *   · OPS_INGEST_URL   → whatever it says. A developer machine is now the
 *                        explicit opt-in, in gitignored `ops/.local.env`.
 *
 * And the other half of the reversal, without which this would be worse than
 * what it replaced: an unreachable endpoint is no longer a silent queue. See
 * `ops-sync.mjs` — it prints the target on every run, and exits non-zero when a
 * person asked for the sync.
 *
 * @param {string} explicit the value of OPS_INGEST_URL, '' when unset
 */
export function resolveIngestUrl(explicit) {
  const url = explicit || PRODUCTION_INGEST_URL
  let isProduction = false
  try {
    isProduction = new URL(url).origin === new URL(PRODUCTION_INGEST_URL).origin
  } catch {
    // An unparseable value is not production, and the sync will fail loudly on
    // it — better than quietly treating a typo as a local address.
    isProduction = false
  }

  return {
    ingestUrl: url,
    /** Named so the sync can print WHERE it published, every time. */
    ingestUrlSource: explicit ? 'OPS_INGEST_URL' : 'default',
    ingestUrlIsProduction: isProduction,
  }
}

/** One warning line, never a stack trace — these scripts must not become the story. */
export function warn(message) {
  console.warn(`ops: ${message}`)
}
