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
    /**
     * OPS_INGEST_URL only — deliberately NOT falling back to NEXT_PUBLIC_APP_URL.
     *
     * That fallback existed for one commit and was wrong: NEXT_PUBLIC_APP_URL is
     * https://app.sahodalabs.com, so every PostToolUse hook on a developer's
     * laptop would have POSTed local board state to production. Syncing to
     * prod has to be something someone typed on purpose, not the default that
     * happens when a var is unset.
     */
    ingestUrl: read('OPS_INGEST_URL') || 'http://localhost:3000',
  }
  return cache
}

/** One warning line, never a stack trace — these scripts must not become the story. */
export function warn(message) {
  console.warn(`ops: ${message}`)
}
