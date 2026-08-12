import type { BrandMemoryPayload } from '@sahoda/shared'

/**
 * A Brand Brain leaf is a string or a string[] — the payload is exactly two
 * levels deep (section -> leaf) and never nests further, so a dotted path like
 * `voice.descriptor` addresses every field in the brain.
 */
export type BrainLeaf = string | string[]

/** The payload's actual runtime shape, narrowed once here instead of at each call site. */
type Sectioned = Record<string, Record<string, BrainLeaf> | undefined>

function splitPath(path: string): [string, string] | null {
  const parts = path.split('.')
  if (parts.length !== 2) return null
  const [section, key] = parts
  if (!section || !key) return null
  return [section, key]
}

/** The value at `path`, or undefined when the path names nothing in this brain. */
export function readLeaf(brain: BrandMemoryPayload, path: string): BrainLeaf | undefined {
  const parts = splitPath(path)
  if (!parts) return undefined
  const [section, key] = parts
  return (brain as unknown as Sectioned)[section]?.[key]
}

/**
 * A copy of `brain` with `path` set to `value`. Returns the input unchanged when
 * the path names nothing — a caller cannot invent a field by mistyping one.
 */
export function writeLeaf(
  brain: BrandMemoryPayload,
  path: string,
  value: BrainLeaf,
): BrandMemoryPayload {
  const parts = splitPath(path)
  if (!parts) return brain
  const [section, key] = parts
  const sectioned = brain as unknown as Sectioned
  const bag = sectioned[section]
  if (!bag || !(key in bag)) return brain
  return { ...brain, [section]: { ...bag, [key]: value } } as BrandMemoryPayload
}

/**
 * Whether two leaves say the same thing.
 *
 * Arrays compare INDEX-WISE, not as sets. Order carries meaning in every list
 * here — `signature_phrases` reads top-down as a voice, `sample_hooks` as a
 * ranked set of openers — so reordering is a real edit and must register as one.
 * (This repo has shipped defects from reading an ordered text[] as a set; the
 * rule is stated rather than left to the reader.)
 */
export function leavesEqual(a: BrainLeaf | undefined, b: BrainLeaf | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  const aList = Array.isArray(a)
  const bList = Array.isArray(b)
  if (aList !== bList) return false
  if (!aList || !bList) return a === b
  if (a.length !== b.length) return false
  return a.every((item, index) => item === b[index])
}
