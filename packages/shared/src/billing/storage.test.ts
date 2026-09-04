import { describe, it, expect } from 'vitest'

import {
  WORKSPACE_STORAGE_LIMIT_BYTES,
  WORKSPACE_STORAGE_LIMIT_LABEL,
  formatStorageBytes,
  storageState,
  storageWouldExceed,
} from './storage'

const GB = 1_000_000_000
const MB = 1_000_000

describe('the allowance itself', () => {
  it('is one decimal gigabyte, and the label says the same number', () => {
    // The constant and the words a customer reads are asserted together. A limit
    // raised in code while a screen still promises 1 GB is the defect this pair
    // exists to catch, and it is invisible to a test of either half alone.
    expect(WORKSPACE_STORAGE_LIMIT_BYTES).toBe(GB)
    expect(WORKSPACE_STORAGE_LIMIT_LABEL).toBe('1 GB')
  })
})

describe('storageState', () => {
  it('reports what is left, not what is over', () => {
    const state = storageState(400 * MB)

    expect(state.usedBytes).toBe(400 * MB)
    expect(state.remainingBytes).toBe(600 * MB)
    expect(state.fraction).toBeCloseTo(0.4, 5)
    expect(state.full).toBe(false)
    expect(state.nearlyFull).toBe(false)
  })

  it('a workspace past the limit has nothing left, never a negative', () => {
    // Rows can be summed while an upload is in flight, and a bucket can hold more
    // than the ceiling if the limit is ever lowered. "-40 MB remaining" is not a
    // sentence, and a bar drawn past its own end reads as a rendering bug.
    const state = storageState(1.4 * GB)

    expect(state.remainingBytes).toBe(0)
    expect(state.fraction).toBe(1)
    expect(state.full).toBe(true)
    expect(state.nearlyFull).toBe(false)
  })

  it('full and nearlyFull are never both true', () => {
    // They drive different sentences. "Nearly full" beside "full" would be the
    // screen contradicting itself in two adjacent lines.
    for (const used of [0, 500 * MB, 900 * MB, 999 * MB, GB, 2 * GB]) {
      const state = storageState(used)
      expect(state.full && state.nearlyFull, `${used}`).toBe(false)
    }
  })

  it('warns from 90% and not before', () => {
    expect(storageState(899 * MB).nearlyFull).toBe(false)
    expect(storageState(900 * MB).nearlyFull).toBe(true)
    expect(storageState(999 * MB).nearlyFull).toBe(true)
  })

  it('exactly at the limit is full, and has zero left', () => {
    const state = storageState(GB)

    expect(state.full).toBe(true)
    expect(state.remainingBytes).toBe(0)
  })

  it('treats a nonsense reading as zero rather than drawing it', () => {
    // The sum comes from four tables whose byte columns are nullable on three of
    // them. NaN or a negative means something upstream is wrong; a meter that
    // rendered it would hide the fault behind a plausible-looking bar.
    for (const bad of [Number.NaN, -1, Number.POSITIVE_INFINITY, -5 * GB]) {
      const state = storageState(bad)
      expect(state.usedBytes, `${bad}`).toBe(0)
      expect(state.fraction, `${bad}`).toBe(0)
    }
  })
})

describe('storageWouldExceed', () => {
  it('refuses the file that would cross the line', () => {
    const state = storageState(950 * MB)

    expect(storageWouldExceed(state, 60 * MB)).toBe(true)
  })

  it('a file that lands EXACTLY on the limit fits', () => {
    // `>` not `>=`. A workspace with 50 MB free and a 50 MB file is at its
    // allowance, which is a place the product lets you be.
    const state = storageState(950 * MB)

    expect(storageWouldExceed(state, 50 * MB)).toBe(false)
    expect(storageWouldExceed(state, 50 * MB + 1)).toBe(true)
  })

  it('a full workspace refuses even one byte', () => {
    expect(storageWouldExceed(storageState(GB), 1)).toBe(true)
  })

  it('an empty workspace accepts a file the size of the whole allowance', () => {
    expect(storageWouldExceed(storageState(0), GB)).toBe(false)
    expect(storageWouldExceed(storageState(0), GB + 1)).toBe(true)
  })
})

describe('formatStorageBytes', () => {
  it('says each scale the way a person would', () => {
    expect(formatStorageBytes(0)).toBe('0 B')
    expect(formatStorageBytes(512)).toBe('512 B')
    expect(formatStorageBytes(4_000)).toBe('4 KB')
    expect(formatStorageBytes(4_000_000)).toBe('4 MB')
    expect(formatStorageBytes(953_674_316)).toBe('954 MB')
    expect(formatStorageBytes(GB)).toBe('1.0 GB')
    expect(formatStorageBytes(1.44 * GB)).toBe('1.4 GB')
  })

  it('never renders more precision than the number earns', () => {
    // "0.9537 GB" invites arithmetic nobody asked for. Only gigabytes carry a
    // decimal, because that is the one scale where the next digit is real space.
    expect(formatStorageBytes(400 * MB)).not.toContain('.')
    expect(formatStorageBytes(1.2 * GB)).toContain('.')
  })

  it('is decimal, matching the upload cap and the operating system', () => {
    // 1,048,576 is a binary megabyte. If this ever answered "1 MB" the meter would
    // disagree with the file size the customer's own computer showed them.
    expect(formatStorageBytes(1_048_576)).toBe('1 MB')
    expect(formatStorageBytes(1_073_741_824)).toBe('1.1 GB')
  })
})
