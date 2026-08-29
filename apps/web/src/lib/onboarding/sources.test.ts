import { describe, it, expect } from 'vitest'

import { sendableSources } from './sources'

/**
 * The rule the summary card and the sender must share.
 *
 * These assert the GUARANTEE: the number a customer reads is the number of
 * sources the product will actually try to store. Never the picks.
 */

describe('sendableSources', () => {
  /** THE DEFECT. Three tiles ticked, no addresses, and the card said "3". */
  it('counts none when tiles were picked and no address was given', () => {
    expect(sendableSources(['Website', 'Instagram', 'Catalog'], {})).toEqual([])
  })

  it('counts only the picks that carry an address', () => {
    expect(
      sendableSources(['Website', 'Instagram'], { Website: 'https://trainx.in', Instagram: '' }),
    ).toEqual(['Website'])
  })

  it('treats whitespace as no address, because the sender does', () => {
    expect(sendableSources(['Website'], { Website: '   ' })).toEqual([])
  })

  it('ignores an address for a tile nobody picked', () => {
    expect(
      sendableSources(['Website'], { Website: 'https://trainx.in', Catalog: 'https://x.in' }),
    ).toEqual(['Website'])
  })

  /**
   * Not a URL parse. `addUrlDocument` prepends `https://` to a bare host, so
   * refusing one here would drop an address the product accepts.
   */
  it('accepts a bare host, which the server completes', () => {
    expect(sendableSources(['Website'], { Website: 'trainx.in' })).toEqual(['Website'])
  })
})
