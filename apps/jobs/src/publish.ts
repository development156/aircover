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

export { publishPostDeps } from './publish/deps'

export { createStorageReader, createZernioMediaHost, StorageReadError } from './publish/media'
export type { HostMedia, ReadStorageObject, StorageReaderOptions } from './publish/media'
