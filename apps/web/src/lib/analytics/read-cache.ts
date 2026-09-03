/**
 * Two pieces of plumbing for live Zernio reads: a bounded worker pool and a
 * short-lived memo. Pure, so the modules that read for a page can be tested with
 * a fake client and a fake clock.
 *
 * ── WHY THEY EXIST ───────────────────────────────────────────────────────────
 * /posts and the post detail page ask Zernio once per published channel, and the
 * account panel asks twice more. Nothing remembered any answer across requests,
 * so every refresh and every teammate repeated the same third-party calls against
 * a budget of 60 a minute that the inbox shares. And the calls went out in
 * batches: four, wait for all four, the next four. One slow answer held the
 * other three slots idle.
 *
 * ── WHAT THE MEMO REFUSES TO DO ──────────────────────────────────────────────
 * It never remembers a failure. A read that rejected is dropped on the spot, so
 * the next render asks again and a channel that could not be read is reported as
 * exactly that, not as whatever it said ten minutes ago. It also never invents an
 * answer: the value stored is the platform's own response, and the caller still
 * classifies it against the clock of the render that is showing it.
 *
 * The memo is per server instance and lives in module scope, not on
 * `globalThis`: a test that resets modules gets a fresh one, and a deployment
 * that restarts starts empty. Two instances behind one load balancer each keep
 * their own, which means the worst case is one read per instance per TTL rather
 * than one shared read. That is the honest limit of an in-process cache.
 */

/** How long a live answer is reused before the platform is asked again. */
export const LIVE_READ_TTL_MS = 10 * 60 * 1000

/** Reads in flight at once. Zernio rate-limits at 60/min; this stays well under. */
export const LIVE_READ_CONCURRENCY = 4

/**
 * Most answers held at once. Past this the oldest are dropped, so a long-lived
 * instance that has seen many workspaces cannot grow without bound.
 */
const MAX_ENTRIES = 2000

interface Entry {
  /** When the read that produced this answer was started. Epoch milliseconds. */
  readAt: number
  /** The read itself, shared with every caller that arrives while it is in flight. */
  value: Promise<unknown>
}

const entries = new Map<string, Entry>()

/** A live answer and the moment it was asked for, so no figure travels without its time. */
export interface LiveRead<T> {
  value: T
  /** ISO-8601 UTC. */
  readAt: string
}

/**
 * Run `read` for `key`, or reuse the answer from a read started within the TTL.
 *
 * Callers that arrive while a read is still in flight share that one promise, so
 * two renders at the same moment cost one call rather than two. A rejected read
 * is forgotten and rethrown; only the caller decides what a failure means.
 *
 * `now` is the caller's clock in epoch milliseconds. It is a parameter rather than
 * `Date.now()` so a test can move time forward without waiting, and so one render
 * judges freshness by the same clock it classifies with.
 */
export async function memoLiveRead<T>(
  key: string,
  read: () => Promise<T>,
  now: number = Date.now(),
): Promise<LiveRead<T>> {
  const hit = entries.get(key)
  if (hit && now - hit.readAt < LIVE_READ_TTL_MS) {
    return { value: (await hit.value) as T, readAt: new Date(hit.readAt).toISOString() }
  }

  // `Promise.resolve().then` turns a synchronous throw inside `read` into a
  // rejection, so it takes the same path as a failed call rather than escaping
  // before the entry is recorded.
  const value = Promise.resolve().then(read)
  const entry: Entry = { readAt: now, value }
  entries.set(key, entry)
  prune(now)

  try {
    return { value: await value, readAt: new Date(now).toISOString() }
  } catch (error) {
    // Only this entry: a fresher read for the same key may have replaced it.
    if (entries.get(key) === entry) entries.delete(key)
    throw error
  }
}

/** Forget every answer. For tests, which otherwise share one memo across cases. */
export function resetLiveReadCache(): void {
  entries.clear()
}

/** Drop what has expired, and then the oldest, until the memo is within bounds. */
function prune(now: number): void {
  if (entries.size <= MAX_ENTRIES) return
  for (const [key, entry] of entries) {
    if (now - entry.readAt >= LIVE_READ_TTL_MS) entries.delete(key)
  }
  // Insertion order is age order, so the first keys are the oldest.
  for (const key of entries.keys()) {
    if (entries.size <= MAX_ENTRIES) break
    entries.delete(key)
  }
}

/**
 * Run `work` over `items` with at most `limit` in flight, preserving order.
 *
 * A worker pool rather than batches: the moment one read finishes the next one
 * starts, so a slow answer never holds the other slots idle. Rejects if any
 * `work` rejects, the same as `Promise.all`; the callers here wrap each item in
 * its own `try`, so a failed read costs that row and nothing else.
 */
export async function mapBounded<T, R>(
  items: readonly T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`mapBounded needs a positive integer limit, got ${String(limit)}`)
  }
  const out: R[] = new Array<R>(items.length)
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      out[index] = await work(items[index] as T)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}
