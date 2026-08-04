import { defineConfig } from '@trigger.dev/sdk'

/**
 * Trigger.dev project config. `TRIGGER_PROJECT_REF` is read from env so the ref is not
 * committed; deploys fail loudly rather than silently targeting the wrong project.
 *
 * NOTE (untested): every workspace package here ships raw TS via `exports: "./src/index.ts"`
 * with no build step. That layout has not yet been exercised against the Trigger.dev
 * bundler — see apps/jobs/REQUESTS.md. The task cores are deliberately SDK-free so the
 * sanctioned Vercel-cron + QStash fallback stays a wrapper swap if this fights back.
 */
export default defineConfig({
  project: process.env.TRIGGER_PROJECT_REF ?? '',
  dirs: ['./src/trigger'],
  // Five minutes is generous for a publish (one API call plus optional media upload) and
  // for a plan-week run (one model call). It is also deliberately BELOW the 600s credit
  // HOLD TTL: a run that cannot outlive its own hold can never have that hold reaped from
  // under it, which is the failure mode the sweep's grace margin exists to cover.
  maxDuration: 300,
})
