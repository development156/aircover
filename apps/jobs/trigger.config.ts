import { defineConfig } from '@trigger.dev/sdk'

/**
 * Trigger.dev project config. The project id is read from env so it is not committed.
 *
 * ── A NAME MISMATCH THAT WOULD HAVE MADE THE FIRST DEPLOY TARGET NOTHING ─────
 * This read `TRIGGER_PROJECT_REF`, which is set nowhere: the environment provides
 * `TRIGGER_PROJECT_ID` (a `proj_…` value) and `turbo.json` allowlists that name,
 * not the other one. So `project` resolved to the empty string, and because the
 * comment beside it claimed deploys would "fail loudly", nobody had reason to
 * check. It was invisible because apps/jobs has never been deployed — the bug and
 * the reason it went unnoticed are the same fact.
 *
 * The old name is still accepted, so an environment that happens to set it keeps
 * working; the one that exists is preferred.
 *
 * NOTE (untested): every workspace package here ships raw TS via `exports: "./src/index.ts"`
 * with no build step. That layout has not yet been exercised against the Trigger.dev
 * bundler — see apps/jobs/REQUESTS.md. The task cores are deliberately SDK-free so the
 * sanctioned Vercel-cron + QStash fallback stays a wrapper swap if this fights back.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_ID ?? process.env.TRIGGER_PROJECT_REF ?? '',
  dirs: ['./src/trigger'],
  // Five minutes is generous for a publish (one API call plus optional media upload) and
  // for a plan-week run (one model call). It is also deliberately BELOW the 600s credit
  // HOLD TTL: a run that cannot outlive its own hold can never have that hold reaped from
  // under it, which is the failure mode the sweep's grace margin exists to cover.
  maxDuration: 300,
})
