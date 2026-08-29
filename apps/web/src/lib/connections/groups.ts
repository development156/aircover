import { CONNECTABLE, isOfferedForConnect, type CatalogueEntry } from '@/lib/connections/catalogue'

/**
 * THE THREE GROUPS `/connections` DRAWS, AS A PURE FUNCTION.
 *
 * ── WHY THIS LEFT THE PAGE ───────────────────────────────────────────────────
 * It lived inline in `app/(app)/connections/page.tsx`, an async server component
 * that reads the database and Clerk before it groups anything. Nothing in the
 * repository imports that file, so nothing could test it — MEASURED on
 * 2026-08-28 by an adversarial pass: deleting the hiding filter from BOTH page
 * filters left `tsc --noEmit` clean, the custom linter clean, and **452 files /
 * 5724 tests passing**. The behaviour a customer sees was held up by nothing the
 * gate can run.
 *
 * That is the failure this project names in one line: a guard never shown to
 * fail is not a guard. The unit tests beside it exercised `isOfferedForConnect`,
 * a pure helper, and a helper nobody calls is still a passing helper.
 *
 * So the decision moved to where it can be broken on purpose and watched. The
 * page now calls this and renders the result.
 */
export interface ChannelGroups {
  /** An account exists → what is live. */
  linked: CatalogueEntry[]
  /** Connectable, none linked yet → what you can add. */
  open: CatalogueEntry[]
  /** Named, and we cannot link it → why not. */
  stalled: CatalogueEntry[]
}

export interface GroupInputs {
  /** `ZERNIO_PLATFORMS` — the platforms a workspace may actually hold. */
  liveVia: ReadonlySet<string>
  /** How many accounts this workspace has linked, per platform id. */
  linkedCount: (id: string) => number
  /** Defaults to the whole catalogue; injectable so a test need not restate it. */
  entries?: readonly CatalogueEntry[]
}

/**
 * Split the catalogue into what is live, what is on offer, and what we cannot
 * link.
 *
 * ── THE ONE ASYMMETRY, AND IT IS THE POINT ───────────────────────────────────
 * `isOfferedForConnect` gates `open` and `stalled`. It does NOT gate `linked`.
 *
 * Declining to advertise a channel and hiding a customer's live account are
 * different acts, and only the first was asked for. A workspace that already
 * linked Telegram, TikTok or Slack holds a real row, consumes a plan slot, and
 * in Telegram's case still publishes. Filter that tile away and the account
 * keeps working, keeps costing them a slot, and has nowhere left to press
 * Disconnect — a customer locked out of undoing something they did.
 *
 * `linked` also requires `liveVia`, so the escape hatch depends on all three
 * withheld ids being in `ZERNIO_PLATFORMS`. They are. `withheld ids stay
 * connectable` in the tests beside this asserts it, because if that ever stopped
 * being true a linked account would fall into `stalled` — which IS filtered —
 * and vanish, with nothing else failing.
 */
export function groupChannels({
  liveVia,
  linkedCount,
  entries = CONNECTABLE,
}: GroupInputs): ChannelGroups {
  const linked = entries.filter((entry) => liveVia.has(entry.id) && linkedCount(entry.id) > 0)
  const open = entries.filter(
    (entry) =>
      isOfferedForConnect(entry.id) && liveVia.has(entry.id) && linkedCount(entry.id) === 0,
  )
  const stalled = entries.filter((entry) => isOfferedForConnect(entry.id) && !liveVia.has(entry.id))
  return { linked, open, stalled }
}
