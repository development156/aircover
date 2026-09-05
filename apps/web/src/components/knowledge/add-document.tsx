'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Globe, Plus, Type } from 'lucide-react'

import { addPdfDocument, addTypedDocument, addUrlDocument } from '@/app/actions/knowledge'
import type { KnowledgeActionState } from '@/lib/knowledge/ingest'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Modal } from '@/components/ui/modal'
import { Textarea } from '@/components/ui/textarea'
// From `lib/knowledge/limits`, NOT from `read-source` — that module is
// `server-only`, and importing it here 500s every route in the app.
import { MAX_UPLOAD_BYTES } from '@/lib/knowledge/limits'
import { cn } from '@/lib/utils'

/**
 * The three doors into the library.
 *
 * ── ONE CONTROL, NOT THREE BUTTONS IN A ROW ─────────────────────────────────
 * docs/26 §1.5 allows a screen ONE primary action. Three of equal weight makes
 * the owner choose a mechanism before they have chosen a thing, and on a 390px
 * phone it makes three half-width buttons that all wrap. So: one button, and the
 * choice happens inside, where each door can say what it is FOR rather than only
 * what it accepts.
 *
 * ── NO COST LABEL, DELIBERATELY ─────────────────────────────────────────────
 * Every spending button in this app carries its price in the label. This one
 * carries none because there is none: parsing is local, chunking is arithmetic,
 * search is the database's own index, and no model is called anywhere on this
 * path. `pricing.config.json` has no knowledge action and must not gain one.
 * The absence is the honest state, and inventing a figure to make the button
 * look like its neighbours would be charging for work nobody does.
 */

type Door = 'pdf' | 'url' | 'text'

const DOORS: ReadonlyArray<{
  id: Door
  icon: typeof FileText
  label: string
  what: string
}> = [
  {
    id: 'pdf',
    icon: FileText,
    label: 'A PDF',
    what: 'A menu, a rate card, a policy, a brochure. Sahoda reads the text in it.',
  },
  {
    id: 'url',
    icon: Globe,
    label: 'A web page',
    what: 'Sahoda fetches the page and keeps the words, not the navigation.',
  },
  {
    id: 'text',
    icon: Type,
    label: 'Something you type',
    what: 'Opening hours, a question customers keep asking, anything you would say yourself.',
  },
]

export function AddDocument() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [door, setDoor] = useState<Door>('pdf')
  const [state, setState] = useState<KnowledgeActionState | null>(null)
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const fileId = useId()
  const capId = useId()
  /**
   * ── PER-INSTANCE IDS, AND WHY IT IS NOT A DETAIL ─────────────────────────
   * This component renders TWICE on the empty state — once in the page header
   * and once inside the empty state itself — which is deliberate: a control that
   * reports an outcome has to outlive the state change it causes, and
   * `assets/page.tsx` records the bug that taught it.
   *
   * With hardcoded ids that duplication put two elements with the SAME `id` in
   * one document. That is invalid HTML, and the practical effect is worse than
   * the standards violation: `<label for="knowledge-text-title">` resolves to the
   * FIRST match, so every label in the second dialog pointed at a control inside
   * the first — clicking one focused a field in a different, closed dialog, and
   * a screen reader announced the wrong association.
   *
   * Found by a Playwright locator reporting "resolved to 2 elements", which was a
   * test being confused by a real defect rather than a flaky selector.
   */
  const ids = useId()

  const submit = (action: (data: FormData) => Promise<KnowledgeActionState>) => {
    return (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      const data = new FormData(event.currentTarget)
      const form = event.currentTarget
      setState(null)
      startTransition(async () => {
        const result = await action(data)
        setState(result)
        if (result.ok) {
          form.reset()
          // The list is server-rendered, so the new row arrives on a refresh.
          // The dialog stays OPEN and holding the outcome: a control that
          // reports a result has to outlive the state change it caused, or the
          // confirmation unmounts with the empty state it replaced.
          router.refresh()
        }
      })
    }
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} data-guide="knowledge-add">
        <Plus size={16} strokeWidth={1.9} aria-hidden />
        Add to library
      </Button>

      <Modal
        open={open}
        onClose={() => {
          setOpen(false)
          setState(null)
        }}
        title="Add to your library"
        description="Sahoda keeps the words and remembers where each one came from. Nothing here costs credits."
      >
        <div className="flex flex-col gap-4">
          {/* The three doors as radio-like cards. A real fieldset, so arrow keys
              work and a screen reader announces the group. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">What are you adding?</legend>
            {DOORS.map((entry) => (
              <label
                key={entry.id}
                className={cn(
                  'flex cursor-pointer items-start gap-3 rounded-card p-3 text-left transition-colors',
                  'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--brand)]',
                  door === entry.id
                    ? 'bg-brand-wash shadow-[inset_0_0_0_1.5px_var(--brand-lift)]'
                    : 'surface-ring hover:bg-s2',
                )}
              >
                <input
                  type="radio"
                  name="door"
                  value={entry.id}
                  checked={door === entry.id}
                  onChange={() => {
                    setDoor(entry.id)
                    setState(null)
                  }}
                  className="sr-only"
                />
                <entry.icon
                  size={16}
                  strokeWidth={1.8}
                  aria-hidden
                  className={cn('mt-px shrink-0', door === entry.id ? 'text-accent' : 'text-muted')}
                />
                <span className="min-w-0">
                  <span className="block type-body font-[600] text-ink">{entry.label}</span>
                  <span className="block type-sm text-muted">{entry.what}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {door === 'pdf' ? (
            <form onSubmit={submit(addPdfDocument)} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                {/* The input IS the control — a hidden input with a button that
                    click()s it leaves a second, invisible tab stop. Same shape
                    as the composer's MediaAttach and the asset uploader. */}
                <label
                  htmlFor={fileId}
                  className={cn(buttonVariants({ variant: 'secondary' }), 'w-full cursor-pointer')}
                >
                  Choose a PDF
                </label>
                <input
                  ref={fileRef}
                  id={fileId}
                  name="file"
                  type="file"
                  accept="application/pdf,.pdf"
                  required
                  aria-describedby={capId}
                  className="sr-only"
                  onChange={() => setState(null)}
                />
                <p id={capId} className="type-sm text-muted">
                  Up to <span className="num">{Math.floor(MAX_UPLOAD_BYTES / 1_000_000)}</span> MB.
                  Sahoda reads the text layer. A menu saved as a picture has none, and it will say
                  so rather than store an empty document.
                </p>
              </div>
              <Field label="Name it (optional)" htmlFor={`${ids}-pdf-title`}>
                <Input id={`${ids}-pdf-title`} name="title" placeholder="Autumn menu" />
              </Field>
              <Submit pending={pending}>Add PDF</Submit>
            </form>
          ) : null}

          {door === 'url' ? (
            <form onSubmit={submit(addUrlDocument)} className="flex flex-col gap-3">
              <Field label="Address of the page" htmlFor={`${ids}-url`}>
                <Input
                  id={`${ids}-url`}
                  name="url"
                  placeholder="yourshop.com/menu"
                  required
                  inputMode="url"
                  autoComplete="url"
                />
              </Field>
              <Field label="Name it (optional)" htmlFor={`${ids}-url-title`}>
                <Input id={`${ids}-url-title`} name="title" placeholder="Menu page" />
              </Field>
              <Submit pending={pending}>Read this page</Submit>
            </form>
          ) : null}

          {door === 'text' ? (
            <form onSubmit={submit(addTypedDocument)} className="flex flex-col gap-3">
              <Field label="Name it" htmlFor={`${ids}-text-title`}>
                <Input id={`${ids}-text-title`} name="title" placeholder="Opening hours" required />
              </Field>
              <Field label="What Sahoda should know" htmlFor={`${ids}-text-body`}>
                <Textarea
                  id={`${ids}-text-body`}
                  name="text"
                  rows={6}
                  required
                  placeholder={
                    'We open at 7am every day except Monday.\n\nDelivery is free within 3km.'
                  }
                />
              </Field>
              <Submit pending={pending}>Save this</Submit>
            </form>
          ) : null}

          {/* aria-live, because the outcome arrives after a wait and a person
              using a screen reader has no other way to learn it landed. */}
          <p
            aria-live="polite"
            className={cn('type-sm', state ? (state.ok ? 'text-ink' : 'text-danger') : 'sr-only')}
          >
            {state?.message ?? ''}
          </p>
        </div>
      </Modal>
    </>
  )
}

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" variant="primary" disabled={pending}>
      {pending ? 'Reading…' : children}
    </Button>
  )
}

/**
 * A label above its control.
 *
 * `Input` and `Textarea` take no `label` prop — they are the shadcn primitives
 * restyled, and pairing is the caller's job everywhere else in this app. A real
 * `htmlFor`, not a wrapping label, so the association survives a screen reader
 * reading the two separately.
 */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}
