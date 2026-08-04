import { createZernioClient, fetchTransport } from '@sahoda/publishing'
import { getRuntime } from '../runtime'
import { createPublishStore } from './store'
import { createAdapterSelector } from './adapters'
import { createStorageReader, createZernioMediaHost } from './media'
import { createConnectionResolver } from './tokens'
import type { ClaimedPublishDeps } from './runClaimedPublish'

/** Dependencies for one publishPost attempt. */
export function publishPostDeps(): ClaimedPublishDeps {
  const { env, pool } = getRuntime()
  const store = createPublishStore({ pool })
  const transport = fetchTransport()

  // One reader over the private `media` bucket, shared by both media paths: X uploads
  // the bytes to its own endpoint, instagram re-hosts them on Zernio.
  const readStorageObject = createStorageReader({
    supabaseUrl: env.supabaseUrl,
    serviceRoleKey: env.serviceRoleKey,
  })

  // Only built when the rail is provisioned. Absent, `hostMedia` is undefined and
  // instagram fails at MEDIA_REQUIRED — honest, and never a silent text-only post.
  const hostMedia = env.zernioApiKey
    ? createZernioMediaHost({
        client: createZernioClient({ transport, apiKey: env.zernioApiKey }),
        readStorageObject,
      })
    : undefined

  return {
    mode: env.publishMode,
    loadVariant: store.loadVariant,
    // The concurrency seam. Without these two a second cron tick publishes the
    // same post again, which is the failure this whole path exists to prevent.
    claimVariant: store.claimVariant,
    releaseVariant: store.releaseVariant,
    // openSecret is intentionally unwired: packages/publishing exports no vault opener,
    // so a live publish fails honestly instead of inventing a token (see REQUESTS.md).
    resolveConnection: createConnectionResolver({ loadConnection: store.loadConnection }),
    adapterFor: createAdapterSelector({
      mode: env.publishMode,
      transport,
      zernioApiKey: env.zernioApiKey,
      readMedia: readStorageObject,
    }),
    ...(hostMedia ? { hostMedia } : {}),
    writeLog: store.writeLog,
    markVariant: store.markVariant,
    markConnection: store.markConnection,
  }
}
