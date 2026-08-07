import type { BrandMemoryPayload } from '@sahoda/shared'

// Drives the Refine step's Signal Clarity meter (docs/superpowers spec, "3.
// Refine"): the fraction of tracked leaf fields on the resolved Brand Memory
// that are non-empty. A "leaf" is a string field or a string[] field — arrays
// are counted whole (non-empty array = filled), never per-item, so a 3-item
// array of blank strings still counts as one filled leaf.
type Leaf = string | string[]

function isFilled(leaf: Leaf): boolean {
  return Array.isArray(leaf) ? leaf.length > 0 : leaf.trim().length > 0
}

function collectLeaves(value: unknown): Leaf[] {
  if (Array.isArray(value)) return [value as string[]]
  if (typeof value === 'string') return [value]
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectLeaves)
  }
  return []
}

/** 0–100. Rounded fraction of non-empty leaf fields across the whole payload. */
export function signalClarityPercent(payload: BrandMemoryPayload): number {
  const leaves = collectLeaves(payload)
  if (leaves.length === 0) return 0
  const filled = leaves.filter(isFilled).length
  return Math.round((filled / leaves.length) * 100)
}
