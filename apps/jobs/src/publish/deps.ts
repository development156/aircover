import { fetchTransport } from '@sahoda/publishing'
import { getRuntime } from '../runtime'
import { createPublishStore } from './store'
import { createAdapterSelector } from './adapters'
import { createConnectionResolver } from './tokens'
import type { PublishPostDeps } from './runPublishPost'

/** Dependencies for one publishPost attempt. */
export function publishPostDeps(): PublishPostDeps {
  const { env, pool } = getRuntime()
  const store = createPublishStore({ pool })

  return {
    mode: env.publishMode,
    loadVariant: store.loadVariant,
    // openSecret is intentionally unwired: packages/publishing exports no vault opener,
    // so a live publish fails honestly instead of inventing a token (see REQUESTS.md).
    resolveConnection: createConnectionResolver({ loadConnection: store.loadConnection }),
    adapterFor: createAdapterSelector({ mode: env.publishMode, transport: fetchTransport() }),
    writeLog: store.writeLog,
    markVariant: store.markVariant,
    markConnection: store.markConnection,
  }
}
