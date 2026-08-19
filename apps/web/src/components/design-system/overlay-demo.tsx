'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Drawer } from '@/components/ui/drawer'
import { Chip } from '@/components/ui/chip'

/**
 * Modal and drawer, openable on the gallery.
 *
 * They are shown LIVE rather than as a static picture of a panel, because the
 * half of these primitives that matters — the focus trap, Escape, the backdrop
 * click, the return of focus — is invisible in a screenshot and is exactly the
 * half that gets reimplemented differently at each call site.
 */
export function OverlayDemo() {
  const [modal, setModal] = useState(false)
  const [drawer, setDrawer] = useState(false)

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <p className="type-eyebrow mb-1.5 text-muted">modal</p>
        <Button variant="secondary" onClick={() => setModal(true)}>
          Open modal
        </Button>
      </div>
      <div>
        <p className="type-eyebrow mb-1.5 text-muted">drawer</p>
        <Button variant="secondary" onClick={() => setDrawer(true)}>
          Open drawer
        </Button>
      </div>

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Delete this post?"
        description="It cannot be brought back."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModal(false)}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => setModal(false)}>
              Delete for good
            </Button>
          </>
        }
      >
        <p className="type-body">
          A modal interrupts and demands an answer. Escape closes it, focus is trapped inside it,
          and focus returns to the button that opened it.
        </p>
      </Modal>

      <Drawer open={drawer} onClose={() => setDrawer(false)} title="Filters">
        <p className="type-body">
          A drawer is a side surface you consult while the page behind it stays the subject. If the
          user must answer it, it is a modal.
        </p>
      </Drawer>
    </div>
  )
}

/**
 * The removable chip, demonstrated from a CLIENT component.
 *
 * It has to live here rather than in the rack: `onRemove` is a function, and a
 * server component cannot hand a function to a client one. The rack is a server
 * component, so passing the handler there returned a 500 — the same mistake any
 * screen session would make, which is why the example is kept rather than the
 * handler quietly dropped.
 */
export function RemovableChipDemo() {
  const [channels, setChannels] = useState(['Instagram', 'LinkedIn'])
  return (
    <span className="flex flex-wrap items-center gap-2">
      {channels.map((c) => (
        <Chip
          key={c}
          removeLabel={`Remove ${c}`}
          onRemove={() => setChannels((v) => v.filter((x) => x !== c))}
        >
          {c}
        </Chip>
      ))}
      {channels.length === 0 ? (
        <button
          type="button"
          onClick={() => setChannels(['Instagram', 'LinkedIn'])}
          className="type-sm text-accent underline"
        >
          Put them back
        </button>
      ) : null}
    </span>
  )
}
