// `@sahoda/jobs/publish` — the publishPost core, reachable WITHOUT the Trigger.dev SDK.
//
// Same reasoning as ./sweeps.ts: the package barrel exports the durable task wrappers and
// drags @trigger.dev/sdk in with them, and apps/jobs has never been deployed to
// Trigger.dev. Publishing therefore has to be reachable from the runner that actually
// exists — a Next.js route in apps/web — and that is what this entry point is for.
//
// Unlike ./sweeps.ts this one DOES pull @sahoda/publishing, and it must: an adapter is
// the whole point. What it must never pull is the Trigger.dev SDK. publish/deps.ts and
// everything under it import only the runtime, the store, the adapters and the media
// host, so the boundary holds; keep it that way when adding re-exports here.
//
// Server-only, exactly like the barrel: these deps hold a service-role database URL and
// the Zernio API key.
export { runPublishPost } from './publish/runPublishPost'
export type {
  PublishJobContext,
  PublishLogEntry,
  PublishLogError,
  PublishMode,
  PublishOutcome,
  PublishPostDeps,
  PublishVariant,
  ResolvedConnection,
  VariantUpdate,
} from './publish/runPublishPost'

export {
  runClaimedPublish,
  PUBLISH_LEASE_SECONDS,
  PublishInfraError,
} from './publish/runClaimedPublish'
export type {
  ClaimedPublishDeps,
  ClaimedPublishResult,
  ClaimRefusal,
  PublishInfraStage,
} from './publish/runClaimedPublish'

export { publishPostDeps } from './publish/deps'

export { createStorageReader, createZernioMediaHost, StorageReadError } from './publish/media'
export type { HostMedia, ReadStorageObject, StorageReaderOptions } from './publish/media'

// The polling reconciliation that stands in for webhooks we cannot verify. It lives
// on this entry point rather than ./sweeps because it needs the Zernio client, and
// ./sweeps is deliberately kept free of @sahoda/publishing.
export { runReconcileSweep } from './reconcile/sweep'
export type {
  AccountFacts,
  ConnectionToCheck,
  PublishResolution,
  ReconcileMode,
  ReconcileReport,
  ReconcileSweepDeps,
  UnresolvedPublish,
} from './reconcile/sweep'
export { reconcileSweepDeps } from './reconcile/deps'
export type { ReconcileDepsOptions } from './reconcile/deps'

// The nightly metric-history pass, on this entry point for the same reason the
// reconciliation is: it needs the Zernio client, and ./sweeps is deliberately kept
// free of @sahoda/publishing.
//
// EXPORTED HERE SO A RUNNER CAN REACH IT — and there is no runner yet. Nothing in
// this package has ever been deployed to Trigger.dev, so `metricCaptureTask` is a
// wrapper around a task nothing invokes. Being reachable without the SDK is what
// makes wiring it to the runner that DOES exist (a Next.js route in apps/web) a
// small change rather than a rewrite. It cannot simply join the five-minute sweep
// tick: this pass is one Zernio request per published channel and stores one row
// per DAY, so running it 288 times a day would spend the rate limit to write
// nothing 287 of those times. See docs/24_Migration_Batch.md under A2.
export { runMetricCapture, CAPTURED_METRICS } from './metrics/capture'
export type {
  CapturedMetric,
  MetricCaptureDeps,
  MetricCaptureReport,
  MetricSnapshot,
  MetricTarget,
  SnapshotStorage,
} from './metrics/capture'
export { metricCaptureDeps, ZernioNotProvisionedError } from './metrics/deps'
export type { MetricCaptureDepsOptions } from './metrics/deps'
export { createMetricStore } from './metrics/store'
