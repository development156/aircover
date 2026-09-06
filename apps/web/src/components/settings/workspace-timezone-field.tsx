'use client'

import { useEffect, useState, useTransition } from 'react'

import { setWorkspaceTimezone } from '@/app/actions/workspace'
import { Button } from '@/components/ui/button'
import { InlineError } from '@/components/posts/inline-error'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * Where this business is, recorded rather than guessed.
 *
 * ── WHY THE BROWSER'S ZONE IS OFFERED AND NEVER STORED SILENTLY ──────────────
 * `Intl.DateTimeFormat().resolvedOptions().timeZone` is a fact about a DEVICE,
 * not about a business. A founder reading this on holiday in London runs a
 * bakery that is still in Pune. So the browser's zone is offered as the first
 * option and has to be chosen, which is the rule `to-stored-intake.ts` already
 * follows for the onboarding picks: a default is not a fact about the customer.
 *
 * ── WHY THE LIST IS NOT CURATED ──────────────────────────────────────────────
 * `Intl.supportedValuesOf('timeZone')` is the runtime's own list. A hand-picked
 * shortlist would be a claim about which countries this product serves, and
 * would silently exclude somebody. Where the runtime does not offer the call,
 * the control falls back to a text box and the server and the database still
 * refuse a zone that is not real.
 *
 * ── THE ZONES ARE READ AFTER MOUNT ───────────────────────────────────────────
 * Same reason `schedule-field.tsx` sets its clock after mount: the server has
 * no business knowing what the reader's browser thinks, and rendering it during
 * SSR would hydrate against a different value.
 */
export function WorkspaceTimezoneField({
  workspaceId,
  initialTimezone,
}: {
  workspaceId: string
  initialTimezone: string | null
}) {
  const [value, setValue] = useState(initialTimezone ?? '')
  const [saved, setSaved] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [zones, setZones] = useState<readonly string[] | null>(null)
  const [here, setHere] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    try {
      setHere(new Intl.DateTimeFormat().resolvedOptions().timeZone || null)
    } catch {
      setHere(null)
    }
    try {
      const supported = (
        Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
      ).supportedValuesOf?.('timeZone')
      setZones(supported ?? null)
    } catch {
      setZones(null)
    }
  }, [])

  const current = initialTimezone ?? ''
  const dirty = value !== current

  function save() {
    setError(null)
    setSaved(undefined)
    startTransition(async () => {
      const result = await setWorkspaceTimezone(workspaceId, value === '' ? null : value)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setSaved(result.timezone)
    })
  }

  /**
   * The stored value is always an option, even when this runtime has never
   * heard of it. Dropping it would silently rewrite somebody's setting to blank
   * the moment they opened the page on an older browser.
   */
  const options = (() => {
    if (zones === null) return null
    const set = new Set(zones)
    if (initialTimezone !== null) set.add(initialTimezone)
    if (here !== null) set.add(here)
    return [...set].sort()
  })()

  return (
    <div className="flex flex-col items-stretch gap-2">
      <div className="flex items-center gap-2 max-narrow:flex-col max-narrow:items-stretch">
        {options === null ? (
          <input
            id="workspace-timezone"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={DEFAULT_ZONE}
            aria-label="Time zone"
            className="min-w-0 flex-1 rounded-input border border-line bg-bg px-3 py-2 type-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring max-narrow:min-h-[44px]"
          />
        ) : (
          <select
            id="workspace-timezone"
            data-workspace-timezone
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-label="Time zone"
            className="min-w-0 flex-1 rounded-input border border-line bg-bg px-3 py-2 type-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring max-narrow:min-h-[44px]"
          >
            {/* Named for what it MEANS, not "None". Nobody has told us is a
                real answer and the reader is allowed to give it back. */}
            <option value="">Not set</option>
            {here !== null ? <option value={here}>{here} (this device)</option> : null}
            {options.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        )}
        <Button
          variant="secondary"
          size="sm"
          disabled={!dirty}
          loading={pending}
          onClick={save}
          className="flex-none max-narrow:min-h-[44px]"
        >
          Save
        </Button>
      </div>
      {error ? <InlineError>{error}</InlineError> : null}
      {saved !== undefined ? (
        <p data-saved-timezone className="type-meta font-semibold text-accent">
          {saved === null
            ? 'Cleared. Sahoda has no time zone for this workspace.'
            : `Saved. Sahoda has this workspace in ${saved}.`}
        </p>
      ) : null}
    </div>
  )
}
