'use client'

import { useId, useState, useTransition } from 'react'

import { updateLeadContact } from '@/app/actions/leads'
import { PlatformMark } from '@/components/leads/platform-mark'
import type { LeadView } from '@/lib/leads/read'

/**
 * ONE LEAD, CLOSED TO A NAME AND A MARK.
 *
 * ── WHAT THE COLLAPSED CARD IS ALLOWED TO SHOW ───────────────────────────────
 * Founder's ruling, 2026-08-25: the name and the platform mark. Nothing else.
 * The board had been rendering the email, the phone, the first line of the
 * message and the source sentence on every card at once, which put a stranger's
 * phone number on screen permanently and made four columns of enquiries
 * unscannable — the one job a pipeline board has.
 *
 * Everything removed is one click away, not gone. That distinction is the whole
 * design: this is a disclosure, not a deletion.
 *
 * ── AND IT IS EDITABLE, BECAUSE THE ROW IS OFTEN WRONG ───────────────────────
 * A name typed into a form by somebody in a hurry, a number missing a digit.
 * Those are corrections a shop owner should not need a support ticket for.
 * `updateLeadContact` takes only the three fields a person knows better than the
 * row does — see its own header for why `message` and `source` are not among
 * them.
 *
 * ── THE WHOLE CARD IS NOT A BUTTON ───────────────────────────────────────────
 * The header is. Wrapping the card in a `<button>` would nest the Move controls
 * and the edit inputs inside a control, which is invalid HTML and behaves badly:
 * a click on a text field would toggle the card shut under the cursor.
 */

/**
 * Class joining WITHOUT `cn`.
 *
 * MEASURED 2026-08-25: `cn` is clsx plus tailwind-merge, and importing it into
 * this CLIENT component pulled a 26.7 kB shared chunk into the /leads route —
 * the bulk of a 31.8 kB regression that failed the js-budget and with it the
 * Vercel build. No client component on this route used `cn` before; `board.tsx`
 * beside it already joins classes by hand for the same reason.
 *
 * tailwind-merge earns its bytes where classes CONFLICT and the later must win.
 * Nothing here conflicts: every call is a base string plus one optional
 * modifier, which is what `filter(Boolean).join(' ')` is for.
 */
function classes(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export interface LeadCardProps {
  lead: LeadView
  /** Rendered inside the open card. The stage controls, which are the board's. */
  actions: React.ReactNode
  busy: boolean
}

export function LeadCard({ lead, actions, busy }: LeadCardProps) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const panelId = useId()

  const name = lead.name?.trim() || 'No name given'

  return (
    <div className="surface-ring rounded-input bg-subtle">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-2 rounded-input px-2.5 py-2 text-left transition-micro hover:bg-s2"
      >
        <PlatformMark platform={lead.platform} />
        {/*
          `min-w-0` and `truncate` together: without the first, a long name in a
          flex row refuses to shrink and pushes the chevron out of the card
          instead of ellipsing.
        */}
        <span className="min-w-0 flex-1 truncate type-body text-ink">{name}</span>
        {/*
          AN INLINE CHEVRON, NOT `lucide-react`.

          Worth 0.5 kB, and it is NOT what broke the budget — `cn` was, at
          26.7 kB. Lucide was the first guess and MEASURED wrong: removing it
          took /leads from 629.9 kB to 629.4 kB against a 598.1 kB budget. The
          note survives because the saving is real and one path beats a module
          import, not because it fixed anything.

          If this card ever needs a second icon, reach for the library and RAISE
          the budget deliberately rather than discovering it in a failed deploy.
        */}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className={classes('shrink-0 text-muted transition-micro', open && 'rotate-180')}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {/*
        Unmounted when shut rather than hidden with CSS. A collapsed card must
        not keep a stranger's phone number in the accessible tree or in the
        page's text for a Ctrl-F to find — "not shown" has to mean not present.
      */}
      {open ? (
        <div id={panelId} className="border-t border-line-soft px-2.5 pb-2.5 pt-2">
          {editing ? (
            <EditForm
              lead={lead}
              onDone={() => setEditing(false)}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <>
              <dl className="grid gap-1">
                <Detail label="Email" value={lead.email} />
                <Detail label="Phone" value={lead.phone} numeric />
                <Detail label="Message" value={lead.message} />
                <Detail label="Came from" value={lead.from} />
              </dl>

              <div className="mt-2 flex flex-wrap gap-1.5">
                {actions}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  disabled={busy}
                  className="rounded-input bg-bg px-2.5 py-1.5 type-sm text-ink transition-colors disabled:opacity-60"
                >
                  Edit details
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}

/**
 * A field, or nothing at all.
 *
 * An absent email renders NO ROW rather than "Email —". docs/37 §4: if the
 * quantity does not exist, the slot should not exist either. A dash here would
 * say "we looked and found nothing", when the truth is the form never asked.
 */
function Detail({
  label,
  value,
  numeric = false,
}: {
  label: string
  value: string | null
  numeric?: boolean
}) {
  if (value === null || value.trim() === '') return null
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2">
      <dt className="type-sm text-muted">{label}</dt>
      <dd className={classes('type-sm break-words text-ink-body', numeric && 'num')}>{value}</dd>
    </div>
  )
}

function EditForm({
  lead,
  onDone,
  onCancel,
}: {
  lead: LeadView
  onDone: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(lead.name ?? '')
  const [email, setEmail] = useState(lead.email ?? '')
  const [phone, setPhone] = useState(lead.phone ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saving, startSaving] = useTransition()

  function save() {
    setError(null)
    startSaving(async () => {
      const result = await updateLeadContact(lead.id, { name, email, phone })
      // Closing on failure would look like a save. The form stays open with
      // what the person typed still in it, which is the only state from which
      // they can try again without retyping.
      if (!result.ok) {
        setError(result.message ?? 'Could not save those details.')
        return
      }
      onDone()
    })
  }

  return (
    <div className="grid gap-2">
      <Field label="Name" value={name} onChange={setName} disabled={saving} />
      <Field label="Email" value={email} onChange={setEmail} disabled={saving} type="email" />
      <Field label="Phone" value={phone} onChange={setPhone} disabled={saving} numeric />

      {error ? (
        <p role="alert" className="type-sm text-danger">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-input bg-ink px-2.5 py-1.5 type-sm text-bg transition-colors disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="rounded-input bg-bg px-2.5 py-1.5 type-sm text-ink transition-colors disabled:opacity-60"
        >
          Cancel
        </button>
      </div>

      {/*
        Says what clearing a field DOES. A person deleting a wrong number needs
        to know that leaving it blank removes it rather than being ignored —
        which is exactly what the action does, and the one edit a
        blank-means-no-change rule would have made impossible.
      */}
      <p className="type-sm text-muted">Clearing a field removes it from this lead.</p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  disabled,
  type = 'text',
  numeric = false,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  disabled: boolean
  type?: 'text' | 'email'
  numeric?: boolean
}) {
  return (
    <label className="grid gap-label-gap">
      <span className="type-eyebrow text-muted">{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={classes(
          'h-input w-full rounded-input border border-line bg-bg px-2.5 type-sm text-ink disabled:opacity-60',
          numeric && 'num',
        )}
      />
    </label>
  )
}
