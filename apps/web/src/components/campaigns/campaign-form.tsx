'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import type { Campaign } from '@sahoda/shared'

import { createCampaign, updateCampaign } from '@/app/actions/campaigns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import type { CampaignSaveState } from '@/lib/campaigns/state'

/**
 * Naming a campaign — the one thing that has to happen before anything else can.
 *
 * ── FOUR FIELDS, AND ONLY ONE OF THEM IS REQUIRED ────────────────────────────
 * A campaign is a name. The period and the objective are things a customer may
 * or may not have decided, and asking for them as though they were required
 * would make people invent them — a made-up end date is a worse artefact than
 * no end date, because everything downstream then treats it as a decision.
 *
 * ── THERE IS NO BUDGET FIELD, AND THAT IS THE DESIGN ─────────────────────────
 * The reference asks for one. There is no budget column, no spend record, and
 * nothing that could ever check the number against reality, so a budget input
 * would collect a figure this product then shows back as though it meant
 * something. The migration argues it at length: money needs the care the credit
 * ledger has, and a text box is not that.
 *
 * ── WHY THE REFUSAL LANDS ON THE FIELD ───────────────────────────────────────
 * `CampaignSaveState` carries an optional `field`, so "the end date comes before
 * the start date" appears beside the dates rather than in a toast the reader has
 * to map back onto a box they can no longer see.
 */
export function CampaignForm({
  campaign,
  trigger,
}: {
  /** Absent to create; present to edit. The verb changes, nothing else does. */
  campaign?: Campaign
  trigger?: 'primary' | 'secondary'
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<CampaignSaveState & { ok: false }>()
  const [pending, startTransition] = useTransition()

  const editing = campaign !== undefined

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setError(undefined)

    startTransition(async () => {
      const result = editing
        ? await updateCampaign(campaign.id, formData)
        : await createCampaign(formData)

      if (!result.ok) {
        setError(result)
        // The sentence is already beside the field it is about; a toast as well
        // would say it twice. Field-less refusals have nowhere else to go.
        if (!result.field) toast.error(result.message)
        return
      }

      setOpen(false)
      toast.success(editing ? 'Saved' : 'Campaign created')
      // Straight into the campaign that was just made: the next thing anyone
      // wants is to put posts in it, and that lives on the detail screen.
      if (!editing) router.push(`/campaigns/${result.campaignId}`)
      else router.refresh()
    })
  }

  return (
    <>
      <Button variant={trigger ?? 'primary'} onClick={() => setOpen(true)}>
        {editing ? null : <Plus size={16} strokeWidth={2} aria-hidden />}
        {editing ? 'Edit campaign' : 'Create campaign'}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? 'Edit campaign' : 'Create campaign'}
        description={
          editing
            ? undefined
            : 'A campaign groups posts under one push, so you can plan and read them together.'
        }
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field
            id="campaign-name"
            label="Name"
            hint="What you would call this push out loud — “Diwali week”, “New menu”."
            error={error?.field === 'name' ? error.message : undefined}
          >
            <Input
              id="campaign-name"
              name="name"
              required
              autoFocus
              maxLength={120}
              defaultValue={campaign?.name ?? ''}
              placeholder="Diwali week"
            />
          </Field>

          <Field
            id="campaign-objective"
            label="What it is for"
            hint="Optional. In your words — nothing reads this but you."
            error={error?.field === 'objective' ? error.message : undefined}
          >
            <Input
              id="campaign-objective"
              name="objective"
              maxLength={200}
              defaultValue={campaign?.objective ?? ''}
              placeholder="Fill the Saturday lunch slot"
            />
          </Field>

          <fieldset className="flex flex-col gap-2">
            <legend className="type-sm mb-1 font-[550]">When it runs</legend>
            <div className="flex flex-wrap gap-3">
              <div className="flex min-w-[150px] flex-1 flex-col gap-1">
                <Label htmlFor="campaign-starts" className="type-sm text-muted">
                  Starts
                </Label>
                <Input
                  id="campaign-starts"
                  name="starts_at"
                  type="date"
                  defaultValue={dateValue(campaign?.starts_at)}
                />
              </div>
              <div className="flex min-w-[150px] flex-1 flex-col gap-1">
                <Label htmlFor="campaign-ends" className="type-sm text-muted">
                  Ends
                </Label>
                <Input
                  id="campaign-ends"
                  name="ends_at"
                  type="date"
                  defaultValue={dateValue(campaign?.ends_at)}
                />
              </div>
            </div>
            {/* Both dates are optional and the screen never invents one. Saying
                so here stops people typing a date they have not decided. */}
            <p className="type-sm text-muted">
              Optional. Nothing starts or ends a campaign on its own — you move it when you are
              ready.
            </p>
            {error?.field === 'dates' ? (
              <p role="alert" className="type-sm font-[550] text-danger">
                {error.message}
              </p>
            ) : null}
          </fieldset>

          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {editing ? 'Save campaign' : 'Create campaign'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  )
}

/**
 * `<input type="date">` wants `YYYY-MM-DD`; the column hands back a full
 * timestamp. Sliced rather than passed through `Date`, which would shift the day
 * across a timezone boundary and silently move a customer's start date.
 */
function dateValue(iso: string | null | undefined): string {
  return typeof iso === 'string' ? iso.slice(0, 10) : ''
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string
  label: string
  hint: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="type-sm font-[550]">
        {label}
      </Label>
      {children}
      {error ? (
        <p role="alert" className="type-sm font-[550] text-danger">
          {error}
        </p>
      ) : (
        <p className="type-sm text-muted">{hint}</p>
      )}
    </div>
  )
}
