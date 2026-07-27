'use client'

import { useState, useTransition } from 'react'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'

import { createTask } from '@/app/actions/ops-board'

/**
 * Inline add for the To Do column (doc 13 §10).
 *
 * The next SL code is allocated by the database, not guessed here — two people
 * adding a card at the same moment would otherwise both reach for the same
 * number. The toast names the code that was actually created, so the writer can
 * find the card they just made.
 */
export function AddCard() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return

    startTransition(async () => {
      const result = await createTask({ title: trimmed })
      if (result.ok) {
        toast.success(`Added ${result.code}`)
        setTitle('')
        setOpen(false)
      } else {
        toast.error(result.message)
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-center gap-1.5 rounded-input border border-dashed border-line px-3 py-2 text-[12px] text-muted transition-micro hover:border-ink hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Plus size={13} strokeWidth={1.8} aria-hidden />
        Add a card
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-input border border-line bg-bg p-2 shadow-card">
      <label className="sr-only" htmlFor="new-card-title">
        Card title
      </label>
      <input
        id="new-card-title"
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false)
        }}
        maxLength={200}
        placeholder="What needs doing?"
        className="w-full rounded-input border border-line bg-s1 px-2 py-1.5 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending || title.trim() === ''}
          className="rounded-pill bg-primary px-3 py-1 text-[12px] font-semibold text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white disabled:pointer-events-none disabled:opacity-45"
        >
          {pending ? 'Adding…' : 'Add card'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-pill px-2 py-1 text-[12px] text-muted transition-micro hover:bg-s2 hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
