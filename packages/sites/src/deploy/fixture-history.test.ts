import { describe, it, expect } from 'vitest'
import { createFixtureDeployer } from './fixture'
import { SiteDeployStateSchema, type SiteDeployHistoryEntry } from './port'
import {
  bundle,
  context,
  file,
  historyEntry,
  MAX_TEXT_LENGTH,
  recordingWriter,
  unwrapErr,
  unwrapOk,
} from './fixture-harness'

/**
 * The other half of "every ok state satisfies `SiteDeployStateSchema`": the two inputs that are
 * neither the bundle nor the config.
 *
 * `ctx.previous` is copied into the returned state by `appendHistory` with no check, so one
 * unpersistable entry inherited from an earlier run made the whole new state unpersistable --
 * and the deploy still reported `ok`. `ctx.now` is worse than unchecked: `toISOString()` THROWS
 * on an invalid Date, and that `RangeError` escaped `Promise<Result<SiteDeployState>>` entirely.
 */

const TRACE_ID = 'trace-fixture-history'
const ctx = context.bind(null, TRACE_ID)

describe('the inherited history is checked too, since it is copied into the new state', () => {
  it('rejects a previous entry the column would refuse, writing NOTHING', async () => {
    const writer = recordingWriter()
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: writer.writeFile })

    const error = unwrapErr(
      await deploy(
        bundle(),
        ctx({ previous: [historyEntry({ bundleId: 'q'.repeat(MAX_TEXT_LENGTH + 1) })] }),
      ),
    )

    expect(error.code).toBe('VALIDATION_ERROR')
    expect(error.details).toEqual({ historyIndex: 0 })
    expect(writer.calls()).toEqual([])
  })

  it('rejects a DISHONEST previous entry, not only an over-long one', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    // A file:// url labelled `preview: false` is a public-address claim about a local path.
    const dishonest = historyEntry({ preview: false })

    const error = unwrapErr(await deploy(bundle(), ctx({ previous: [dishonest] })))

    expect(error.details).toEqual({ historyIndex: 0 })
  })

  it('names the POSITION of the bad entry, never its url, which is a host path', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const previous = [
      historyEntry(),
      historyEntry({ url: 'file:///home/secret-user/site/index.html', preview: false }),
    ]

    const error = unwrapErr(await deploy(bundle(), ctx({ previous })))

    expect(error.details).toEqual({ historyIndex: 1 })
    expect(JSON.stringify(error)).not.toContain('secret-user')
  })

  it('does NOT fail a deploy over an entry the history cap evicts anyway', async () => {
    // `appendHistory` prepends one and slices to 5, so `previous[4]` is dropped and never
    // reaches the returned state. Refusing the deploy over it would be a false failure.
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const previous = [
      historyEntry(),
      historyEntry(),
      historyEntry(),
      historyEntry(),
      historyEntry({ bundleId: 'q'.repeat(MAX_TEXT_LENGTH + 1) }),
    ]

    const state = unwrapOk(await deploy(bundle(), ctx({ previous })))

    expect(state.history).toHaveLength(5)
    expect(SiteDeployStateSchema.safeParse(state).success).toBe(true)
  })

  it('DOES fail on the last SURVIVING entry, so the prefix boundary is pinned on both sides', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const previous = [
      historyEntry(),
      historyEntry(),
      historyEntry(),
      historyEntry({ bundleId: 'q'.repeat(MAX_TEXT_LENGTH + 1) }),
      historyEntry(),
    ]

    expect(unwrapErr(await deploy(bundle(), ctx({ previous }))).details).toEqual({
      historyIndex: 3,
    })
  })

  it('rejects a previous history that is not an array at all', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const wrong = ctx({ previous: 'none' as unknown as SiteDeployHistoryEntry[] })

    expect(unwrapErr(await deploy(bundle(), wrong)).code).toBe('VALIDATION_ERROR')
  })
})

describe('an unusable clock is reported, not thrown out of the Result envelope', () => {
  it('returns an error rather than a RangeError when the injected clock is invalid', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })

    // `new Date(NaN).toISOString()` throws, and the throw escaped `Promise<Result<...>>`.
    const result = await deploy(bundle(), ctx({ now: () => new Date(NaN) }))

    expect(result.ok).toBe(false)
    expect(unwrapErr(result).code).toBe('PROVIDER_ERROR')
  })

  it('never reports a live deploy for a clock it could not read', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })

    const result = await deploy(bundle(), ctx({ now: () => new Date('banana') }))

    expect(result.ok).toBe(false)
  })
})

describe('every ok state satisfies the schema that guards its own column', () => {
  it('holds for a first deploy, and for one inheriting a full history', async () => {
    const deploy = createFixtureDeployer({ outDir: '/tmp/out', writeFile: async () => {} })
    const full = [historyEntry(), historyEntry(), historyEntry(), historyEntry(), historyEntry()]

    for (const previous of [[], full]) {
      const state = unwrapOk(
        await deploy(bundle({ files: [file(), file('styles.css')] }), ctx({ previous })),
      )

      expect(SiteDeployStateSchema.safeParse(state).success).toBe(true)
    }
  })
})
