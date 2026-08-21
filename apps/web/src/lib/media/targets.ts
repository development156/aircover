import { CONSTRAINTS } from '@sahoda/shared'
import type { Channel, PlatformSpec } from '@sahoda/shared'
import { mediaRuleFor, type PostFormat } from '@sahoda/publishing/format'

/**
 * WHAT SHAPE EACH CHANNEL ACTUALLY ASKS FOR — read from the frozen Constraint
 * Engine, never invented here.
 *
 * ── THERE IS NO SUCH THING AS "THE INSTAGRAM SIZE" IN THIS CODEBASE ──────────
 * `PlatformSpec.imageDims` is `{ minW, minH, aspectRange? }`: a FLOOR and a
 * BAND. Nothing anywhere declares a canonical width×height for any channel, and
 * writing one here — 1080×1080 for a feed post, 1200×628 for LinkedIn — would be
 * this module inventing the very thing it exists to read. Those numbers are real
 * platform folklore and they are not in our contract, so cropping to them would
 * refuse photos the engine accepts and accept photos it refuses.
 *
 * So a "target" here is the band, and the crop is cut to the NEAREST EDGE of it
 * at the largest size the original can supply. A 1080×1920 photo bound for an
 * Instagram feed post becomes 1080×1440 — exactly 0.75, the edge of the declared
 * range — and keeps every pixel that band allows. A photo already inside the
 * band is not cropped at all.
 *
 * ── WHAT IS DECLARED, CHANNEL BY CHANNEL ────────────────────────────────────
 *   x          minW 4, minH 4. No aspect rule. Effectively unconstrained.
 *   gbp        minW 250, minH 250. NO aspect rule.
 *   linkedin   NOTHING. `imageDims` is absent from the spec entirely.
 *   instagram  minW 320, minH 320, aspect 0.75–1.91 — measured against Zernio's
 *              own dry-run validator at the boundary (see constraints.ts).
 *
 * LinkedIn declares no dimension of any kind, so this module reports `null` for
 * it and leaves it alone. That is the honest answer, not a gap to be filled.
 *
 * Pure: no I/O, no clock, no image decoding. Safe on the client, which is what
 * lets the crop preview and the server-side cut be driven by ONE table.
 */

/**
 * A declared aspect band, as width ÷ height. Either end may be absent, and
 * absent is not the same as zero: the `story` format states a maximum and
 * deliberately no minimum, because a very tall photo is a legal story and an
 * invented floor would refuse one.
 */
export interface AspectBand {
  min: number | null
  max: number | null
}

/** Everything one channel's version demands of a still image. */
export interface MediaTarget {
  channel: Channel
  /** What the version says it is. `null` means no version stated an intent. */
  format: PostFormat | null
  /** The band in force, or `null` when this channel+format declares none. */
  aspect: AspectBand | null
  /** Declared pixel floors, or `null` when the spec declares none. */
  minW: number | null
  minH: number | null
  /** Exactly the mime types this channel will accept. */
  mimes: readonly string[]
  /** The byte ceiling, expanded from `maxMediaMB`. */
  maxBytes: number
}

/** `maxMediaMB` is stated in binary megabytes by `validateMedia`; matched here. */
const MB = 1024 * 1024

/**
 * The band in force for one channel's version.
 *
 * ── THE FORMAT'S RULE REPLACES THE CHANNEL'S, IT DOES NOT STACK ─────────────
 * This mirrors `decideAttach` exactly, and it has to: a target derived from a
 * band the attach check does not apply would cut a photo to a shape that is then
 * refused. `CONSTRAINTS.instagram.imageDims.aspectRange` is the FEED range and a
 * story is 9:16 — stacked, the two are contradictory, and `format-rules.ts`
 * settled it by having the format's own `maxAspect` drop the engine's range for
 * that attachment. `targets.test.ts` asserts the agreement against
 * `decideAttach` over a grid rather than restating the rule.
 */
function aspectFor(spec: PlatformSpec, format: PostFormat | null): AspectBand | null {
  if (format !== null) {
    const rule = mediaRuleFor(spec, format)
    if (rule.maxAspect !== undefined) return { min: null, max: rule.maxAspect }
  }
  const range = spec.imageDims?.aspectRange
  if (range === undefined) return null
  return { min: range[0], max: range[1] }
}

/** What one channel's version asks of an image. */
export function targetFor(channel: Channel, format: PostFormat | null): MediaTarget {
  const spec = CONSTRAINTS[channel]
  return {
    channel,
    format,
    aspect: aspectFor(spec, format),
    minW: spec.imageDims?.minW ?? null,
    minH: spec.imageDims?.minH ?? null,
    mimes: spec.mediaTypes,
    maxBytes: spec.maxMediaMB * MB,
  }
}

/** The targets for a post's whole channel set, in the order the channels were given. */
export function targetsFor(
  channels: readonly Channel[],
  formats: Readonly<Partial<Record<Channel, PostFormat | null>>>,
): MediaTarget[] {
  const seen = new Set<Channel>()
  const out: MediaTarget[] = []
  for (const channel of channels) {
    if (seen.has(channel)) continue
    if (!(channel in CONSTRAINTS)) continue
    seen.add(channel)
    out.push(targetFor(channel, formats[channel] ?? null))
  }
  return out
}

/**
 * Does this channel state any dimension rule at all?
 *
 * Read by the report and by the crop screen, so a channel with nothing declared
 * is SHOWN as having nothing declared rather than being quietly given someone
 * else's numbers.
 */
export function declaresDimensions(target: MediaTarget): boolean {
  return target.aspect !== null || target.minW !== null || target.minH !== null
}
