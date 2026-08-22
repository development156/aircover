'use client'

import { useState, useTransition } from 'react'

import { savePlaybook } from '@/app/actions/playbooks'
import { startRun } from '@/app/actions/playbook-run'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'

/**
 * THE ONE FORM A RECIPE HAS: three blanks and a switch.
 *
 * ── WHY A DEDICATED FORM AND NOT A GENERIC FIELD RENDERER ───────────────────
 * The catalogue carries a `fields` list and it would render. But exactly one
 * recipe is runnable today, and a generic renderer for a set of one is a machine
 * built to be tested by nothing — the four other shapes it claims to handle
 * would be unexercised code shipped on the strength of a loop. When the second
 * recipe lands, the second form is the moment to find out what the two actually
 * share.
 *
 * The labels and help text still come from the catalogue, so the copy has one
 * home.
 */

const CHANNELS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'x', label: 'X' },
  { value: 'gbp', label: 'Google Business' },
] as const

export interface FestivalFormProps {
  /** The stored enrolment, when there is one. */
  playbookId: string | null
  enabled: boolean
  channels: readonly string[]
  calendars: readonly string[]
  leadDays: number
  cadence: 'daily' | 'weekly' | null
  /** What one draft costs at the dial's current setting. */
  itemCredits: number
  /** What the run itself costs. */
  runCredits: number
  labels: Record<string, { label: string; help: string }>
}

export function FestivalForm(props: FestivalFormProps) {
  const [channels, setChannels] = useState<string[]>([...props.channels])
  const [calendars, setCalendars] = useState<string[]>(
    props.calendars.length > 0 ? [...props.calendars] : ['india', 'global'],
  )
  const [leadDays, setLeadDays] = useState(props.leadDays)
  const [cadence, setCadence] = useState<'daily' | 'weekly' | null>(props.cadence)
  const [enabled, setEnabled] = useState(props.enabled)
  const [playbookId, setPlaybookId] = useState(props.playbookId)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const toggleIn = (list: string[], value: string): string[] =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value]

  function save(nextEnabled = enabled) {
    setMessage(null)
    startTransition(async () => {
      const out = await savePlaybook({
        recipeKey: 'festival_calendar',
        enabled: nextEnabled,
        params: { channels, calendars, lead_days: leadDays },
        cadence,
      })
      if (!out.ok) {
        setMessage(out.message ?? 'Could not save that.')
        return
      }
      setPlaybookId(out.playbookId ?? playbookId)
      setEnabled(nextEnabled)
      setMessage(nextEnabled ? 'Saved and switched on.' : 'Saved.')
    })
  }

  function run() {
    setMessage(null)
    startTransition(async () => {
      if (!playbookId) {
        setMessage('Save it first.')
        return
      }
      const out = await startRun(playbookId)
      if (!out.ok) {
        setMessage(out.message ?? 'Could not start that.')
        return
      }
      setMessage(
        out.nothingToDo
          ? 'Nothing falls inside your window right now, so nothing was made and nothing was charged.'
          : 'Ready — the cost preview is below.',
      )
    })
  }

  return (
    <div className="mt-3 grid gap-3">
      <fieldset className="grid gap-2">
        <legend className="type-eyebrow text-muted">{props.labels.calendars?.label}</legend>
        <div className="flex flex-wrap gap-2">
          {[
            { value: 'india', label: 'India' },
            { value: 'global', label: 'Global' },
          ].map((c) => (
            <label key={c.value} className="type-sm flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={calendars.includes(c.value)}
                onChange={() => setCalendars((l) => toggleIn(l, c.value))}
              />
              {c.label}
            </label>
          ))}
        </div>
        <p className="type-sm text-muted">{props.labels.calendars?.help}</p>
      </fieldset>

      <fieldset className="grid gap-2">
        <legend className="type-eyebrow text-muted">{props.labels.channels?.label}</legend>
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <label key={c.value} className="type-sm flex items-center gap-1.5 text-muted">
              <input
                type="checkbox"
                checked={channels.includes(c.value)}
                onChange={() => setChannels((l) => toggleIn(l, c.value))}
              />
              {c.label}
            </label>
          ))}
        </div>
        <p className="type-sm text-muted">{props.labels.channels?.help}</p>
      </fieldset>

      <div className="flex flex-wrap items-end gap-4">
        <label className="grid gap-1">
          <span className="type-eyebrow text-muted">{props.labels.lead_days?.label}</span>
          <input
            type="number"
            min={1}
            max={30}
            value={leadDays}
            onChange={(e) => setLeadDays(Number(e.target.value))}
            className="surface-ring w-24 rounded-card bg-s2 px-2 py-1 type-body tabular-nums text-ink"
          />
        </label>

        <label className="grid gap-1">
          <span className="type-eyebrow text-muted">When it runs</span>
          <select
            value={cadence ?? 'manual'}
            onChange={(e) => {
              const v = e.target.value
              setCadence(v === 'manual' ? null : (v as 'daily' | 'weekly'))
            }}
            className="surface-ring rounded-card bg-s2 px-2 py-1 type-body text-ink"
          >
            <option value="manual">Only when I press Run</option>
            <option value="daily">Every day</option>
            <option value="weekly">Every week</option>
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={() => save()} disabled={pending || channels.length === 0}>
          Save
        </Button>
        <Button
          variant="secondary"
          onClick={() => save(!enabled)}
          disabled={pending || channels.length === 0}
        >
          {enabled ? 'Switch off' : 'Switch on'}
        </Button>
        <Button variant="secondary" onClick={run} disabled={pending || !playbookId}>
          <CostLabel action="Run it now" cost={props.runCredits + props.itemCredits} />
        </Button>
      </div>

      {/* What "Run it now" quotes is ONE draft's worth. The real total depends on
          how many festivals fall in the window, which nobody knows until the run
          looks — so the preview names the real figure and this names the floor. */}
      <p className="type-sm text-muted">
        That price covers the run and one draft. If more than one festival falls inside your window
        the preview below will say so before anything is charged.
      </p>

      {message ? (
        <p role="status" className="type-sm text-muted">
          {message}
        </p>
      ) : null}
    </div>
  )
}
