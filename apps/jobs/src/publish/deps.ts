import { createZernioClient, fetchTransport } from '@sahoda/publishing'
import { getRuntime } from '../runtime'
import { createPublishStore } from './store'
import { createAdapterSelector } from './adapters'
import { createStorageReader, createZernioMediaHost } from './media'
import { createConnectionResolver } from './tokens'
import type { ClaimedPublishDeps } from './runClaimedPublish'
import { createGateClassifier } from '../gate/classifier'
import { createPublishGate } from '../gate/gate'
import { createGateStore } from '../gate/store'
import { getMesh } from '../ai/mesh'

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

  // The refusal gate. Built here rather than passed in because it is not
  // optional and never has been — see `PublishPostDeps.gate`. It shares the same
  // pool as everything else in this object: the gate reads one row and writes
  // one, and a second pool for two statements would be a pool per publish.
  const gateStore = createGateStore({ pool })

  return {
    mode: env.publishMode,
    gate: createPublishGate({
      loadGateContext: gateStore.loadGateContext,
      writeGateAudit: gateStore.writeGateAudit,
      classifier: createGateClassifier({
        // ── THE MESH IS RESOLVED PER CALL, NOT HERE ────────────────────────
        // `createMesh()` fails fast on missing provider keys, by design. Calling
        // it at THIS line would move that throw into `publishPostDeps()`, which
        // the publish-now route classifies as `PublishInfraError('deps')` and
        // reports as a 503 INFRA_UNAVAILABLE — indistinguishable from the
        // database being unreachable, which is the exact confusion the stage
        // classification was introduced to end (2026-08-07, four unattributable
        // 503s). A deployment missing provider keys would have stopped
        // publishing entirely, reported as an outage nobody could locate.
        //
        // Deferred, the same missing key surfaces where it belongs: inside
        // `classify`, whose catch turns it into `unavailable` — a transient hold
        // that retries, names itself in the audit row, and never publishes. The
        // gate still refuses; it just refuses legibly.
        //
        // `getMesh()` is a process-wide singleton, so the deferral costs one
        // property read per publish and nothing on a tick that never gates.
        runTask: ((def, input, meshCtx) => getMesh().runTask(def, input, meshCtx)) as ReturnType<
          typeof getMesh
        >['runTask'],
      }),
    }),
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
